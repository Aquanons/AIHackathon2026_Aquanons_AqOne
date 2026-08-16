import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config.dart';
import '../core/endpoint_guard.dart';
import '../data/secure_credential_store.dart';
import '../models/delivery_state.dart';
import '../models/sos_record.dart';

class RemoteSos {
  const RemoteSos({
    required this.id,
    required this.deliveryState,
    this.localId,
    this.seq,
    this.acknowledgedAt,
    this.ackedBy,
    this.etaAt,
    this.responderStatus,
    this.responderStatusLabel,
    this.responderNote,
    this.fisherReply,
    this.resolvedAt,
  });

  final String id;
  final DeliveryState deliveryState;

  /// The handset's own id for this record. Present only for SOS that reached
  /// the backend by the direct path - a LoRa frame has no room for a UUID -
  /// and it is the primary key for matching a reply back to the outbox.
  final String? localId;

  final int? seq;
  final String? acknowledgedAt;
  final String? ackedBy;

  /// Absolute arrival time, not a duration. See docs/13_RESPONDER_LOOP.md:
  /// a duration decays in transit, a timestamp does not.
  final String? etaAt;

  final int? responderStatus;
  final String? responderStatusLabel;
  final String? responderNote;
  final int? fisherReply;
  final String? resolvedAt;

  static RemoteSos fromJson(Map<String, dynamic> json) {
    final status = json['status'] as String?;
    final declared = DeliveryState.fromWire(json['delivery_state'] as String?);
    final resolved = status == 'acknowledged'
        ? declared.merge(DeliveryState.acknowledged)
        : declared;
    return RemoteSos(
      id: json['id']?.toString() ?? '',
      deliveryState: resolved,
      localId: json['local_id'] as String?,
      seq: (json['seq'] as num?)?.toInt(),
      acknowledgedAt: json['acknowledged_at'] as String?,
      ackedBy: json['acked_by'] as String?,
      etaAt: json['eta_at'] as String?,
      responderStatus: (json['responder_status'] as num?)?.toInt(),
      responderStatusLabel: json['responder_status_label'] as String?,
      responderNote: json['responder_note'] as String?,
      fisherReply: (json['fisher_reply'] as num?)?.toInt(),
      resolvedAt: json['resolved_at'] as String?,
    );
  }
}

class VesselDeviceCredential {
  const VesselDeviceCredential({
    required this.token,
    required this.expiresAt,
    required this.deviceId,
    required this.vesselId,
    required this.label,
  });

  final String token;
  final String expiresAt;
  final int deviceId;
  final String vesselId;
  final String label;

  static VesselDeviceCredential? fromJson(Map<String, dynamic> json) {
    final token = json['token'];
    final expiresAt = json['expires_at'];
    final device = json['device'];
    if (token is! String || expiresAt is! String || device is! Map<String, dynamic>) {
      return null;
    }
    final id = device['id'];
    final vesselId = device['vessel_id'];
    final label = device['label'];
    if (id is! num || vesselId is! String || label is! String) {
      return null;
    }
    return VesselDeviceCredential(
      token: token,
      expiresAt: expiresAt,
      deviceId: id.toInt(),
      vesselId: vesselId,
      label: label,
    );
  }
}

class BackendClient {
  BackendClient({
    http.Client? client,
    String? baseUrl,
    SecureCredentialStore? credentials,
  })  : _client = client ?? http.Client(),
        _credentials = credentials,
        _baseUrl = baseUrl ?? AqOneConfig.backendBaseUrl {
    EndpointGuard.requireHttpsAbsolute(
      _baseUrl,
      label: 'BackendClient baseUrl',
    );
  }

  final http.Client _client;
  final String _baseUrl;

  /// Keystore/Keychain backing for the bearer token. Null in tests and in any
  /// caller that has no platform store, in which case the credential lives
  /// for the session only - which is exactly how Phase 4 left it.
  final SecureCredentialStore? _credentials;

  String? _vesselBearerToken;

  bool get hasVesselCredential =>
      _vesselBearerToken != null && _vesselBearerToken!.isNotEmpty;

  void setVesselBearerToken(String? token) {
    final trimmed = token?.trim();
    _vesselBearerToken =
        trimmed == null || trimmed.isEmpty ? null : trimmed;
  }

  /// Sets the token and persists it to the platform keystore.
  ///
  /// A failed write is not an error the caller has to handle: the session
  /// continues with the token in memory, which is strictly better than
  /// refusing an enrolment because a keystore was unavailable.
  Future<void> _persistVesselBearerToken(String token) async {
    setVesselBearerToken(token);
    await _credentials?.writeVesselToken(token);
  }

  void clearVesselBearerToken() {
    _vesselBearerToken = null;
    // Fire and forget: a revoked token must not linger on disk, but nothing
    // in the calling paths can usefully wait on a keystore delete.
    unawaited(_credentials?.clearVesselCredential() ?? Future<void>.value());
  }

  Future<VesselDeviceCredential?> enrollVesselDevice({
    required String vesselId,
    required String pairingCode,
    String deviceLabel = 'Fisher handset',
  }) async {
    try {
      final response = await _send(
        _request(
          'POST',
          EndpointGuard.backend(_baseUrl, '/api/vessel-auth/enroll'),
          headers: const <String, String>{
            'Content-Type': 'application/json',
          },
          body: jsonEncode(<String, Object?>{
            'vessel_id': vesselId,
            'pairing_code': pairingCode,
            'device_label': deviceLabel,
          }),
        ),
      ).timeout(AqOneConfig.backendTimeout);
      if (response.statusCode != 200) {
        return null;
      }
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        return null;
      }
      final credential = VesselDeviceCredential.fromJson(decoded);
      if (credential == null) {
        return null;
      }
      await _persistVesselBearerToken(credential.token);
      await _credentials?.writeDeviceId('${credential.deviceId}');
      return credential;
    } catch (_) {
      return null;
    }
  }

  Future<VesselDeviceCredential?> refreshVesselCredential() async {
    if (!hasVesselCredential) {
      return null;
    }
    try {
      final response = await _send(
        _request(
          'POST',
          EndpointGuard.backend(_baseUrl, '/api/vessel-auth/refresh'),
          headers: _withVesselAuth(),
        ),
      ).timeout(AqOneConfig.backendTimeout);
      if (response.statusCode == 401 || response.statusCode == 403) {
        clearVesselBearerToken();
        return null;
      }
      if (response.statusCode != 200) {
        return null;
      }
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        return null;
      }
      final credential = VesselDeviceCredential.fromJson(decoded);
      if (credential == null) {
        return null;
      }
      // Persisted, not just set: leaving the old token on disk would mean a
      // restart resurrects an expired credential and the next call 401s.
      await _persistVesselBearerToken(credential.token);
      return credential;
    } catch (_) {
      return null;
    }
  }

  Future<bool> isReachable() async {
    try {
      final response = await _send(
        _request('GET', EndpointGuard.backend(_baseUrl, '/healthz')),
      ).timeout(AqOneConfig.backendTimeout);
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Hand an SOS straight to the backend over the internet.
  ///
  /// The second delivery route, alongside the buoy mesh. When the handset has
  /// signal - which it does near shore, and in the minutes before a boat leaves
  /// coverage - routing a distress call through LoRa would be slower and less
  /// reliable than simply posting it.
  ///
  /// Both routes are attempted for every SOS. The backend de-duplicates on
  /// (vessel_id, client_ts), so a call that arrives twice is one incident on
  /// the dispatcher's screen. Returns true when the backend has the SOS,
  /// whether this request created it or found it already there.
  /// The reason the last direct attempt failed, or null if it succeeded.
  ///
  /// This exists because the previous `catch (_) { return false; }` collapsed
  /// every possible failure - bad hostname, TLS error, HTTP 500, blocked
  /// cleartext - into an indistinguishable false with nothing logged. A
  /// misconfigured base URL then looked identical to being out of signal, and
  /// the app blamed the buoy for a problem the internet path was having.
  String? lastDirectError;

  Future<bool> postSos(SosRecord record) async {
    final payload = record.toBuoyPayload()
      ..['local_id'] = record.localId
      ..['source'] = 'direct';

    try {
      final response = await _send(
        _request(
          'POST',
          EndpointGuard.backend(_baseUrl, '/api/sos'),
          headers: const {'Content-Type': 'application/json'},
          body: jsonEncode(payload),
        ),
      )
          .timeout(AqOneConfig.backendTimeout);

      // 200 covers both "created" and "already known": the emergency is
      // recorded either way, which is all the handset needs to stop retrying
      // this route.
      if (response.statusCode == 200) {
        lastDirectError = null;
        return true;
      }
      lastDirectError = 'backend returned HTTP ${response.statusCode}';
      return false;
    } on TimeoutException {
      lastDirectError =
          'backend did not answer within ${AqOneConfig.backendTimeout.inSeconds}s';
      return false;
    } catch (error) {
      lastDirectError = _describeNetworkError(error);
      return false;
    }
  }

  /// Turns a raw exception into something a person can act on, instead of
  /// Dart's own exception text (a `SocketException` or `TimeoutException`
  /// message reads as gibberish to a fisher, and previously reached the SOS
  /// status card's "Last attempt" line verbatim - see
  /// mobile/lib/ui/widgets/delivery_state_tile.dart). Matched on message text
  /// rather than on `SocketException` / `HandshakeException`, because those
  /// live in `dart:io` and importing it here would break the web build.
  ///
  /// The unrecognised-error fallback deliberately does not include the raw
  /// exception text either - an error type this method does not know about
  /// yet is still not something a fisher at sea needs spelled out for them.
  String _describeNetworkError(Object error) {
    final text = error.toString();
    if (text.contains('TimeoutException')) {
      return 'the app is not getting a signal';
    }
    if (text.contains('Failed host lookup') ||
        text.contains('SocketException') ||
        text.contains('ClientException')) {
      return 'no internet connection';
    }
    if (text.contains('HandshakeException') || text.contains('CERTIFICATE')) {
      return "couldn't establish a secure connection";
    }
    return 'could not reach the server';
  }

  /// Ask the backend what has happened to this vessel's SOS records.
  ///
  /// The path was previously /api/v1/vessels/{id}/sos, which no router ever
  /// served - every poll 404'd, so no acknowledgement ever reached a fisherman.
  Future<List<RemoteSos>> vesselSos(String vesselId) async {
    if (!hasVesselCredential) {
      return const <RemoteSos>[];
    }
    final uri = EndpointGuard.backend(
      _baseUrl,
      '/api/sos/vessel/${Uri.encodeComponent(vesselId)}',
    );
    final response = await _send(
      _request(
        'GET',
        uri,
        headers: _withVesselAuth(),
      ),
    ).timeout(AqOneConfig.backendTimeout);
    if (response.statusCode == 401 || response.statusCode == 403) {
      clearVesselBearerToken();
      return const <RemoteSos>[];
    }
    if (response.statusCode != 200) {
      return const <RemoteSos>[];
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      return const <RemoteSos>[];
    }
    final rows = decoded['events'];
    if (rows is! List) {
      return const <RemoteSos>[];
    }
    return rows
        .whereType<Map<String, dynamic>>()
        .map(RemoteSos.fromJson)
        .toList(growable: false);
  }

  /// The fisher's one-tap answer to an acknowledgement.
  ///
  /// 1 = still in danger, 2 = safe now. Tells the dispatcher the fisher is
  /// alive and read the ETA - which the acknowledgement alone cannot confirm.
  Future<bool> replyToSos(int eventId, int reply) async {
    if (!hasVesselCredential) {
      return false;
    }
    try {
      final response = await _send(
        _request(
          'POST',
          EndpointGuard.backend(_baseUrl, '/api/sos/$eventId/reply'),
          headers: _withVesselAuth(
            const {'Content-Type': 'application/json'},
          ),
          body: jsonEncode(<String, Object?>{'reply': reply}),
        ),
      )
          .timeout(AqOneConfig.backendTimeout);
      if (response.statusCode == 401 || response.statusCode == 403) {
        clearVesselBearerToken();
        return false;
      }
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Generic authenticated-ish GET returning a decoded body, or null.
  ///
  /// Used by the read-only Venture and Home feeds (buoys, hazards,
  /// advisories, sea condition). Returns null rather than throwing so a
  /// caller polling every 30 seconds does not need a try/catch at each site;
  /// a failed poll simply leaves the previous data on screen.
  Future<Object?> getJson(String path) async {
    try {
      final response = await _send(
        _request('GET', EndpointGuard.backend(_baseUrl, path)),
      ).timeout(AqOneConfig.backendTimeout);
      if (response.statusCode != 200) {
        return null;
      }
      return jsonDecode(response.body);
    } catch (_) {
      return null;
    }
  }

  /// Uploads one queued catch log.
  ///
  /// Distinguishes "try again later" from "the server said no": a network
  /// failure or 5xx should be retried, but a 4xx means the entry itself is
  /// unacceptable and retrying forever would just burn battery.
  Future<CatchUploadResult> postCatchLog(Map<String, Object?> payload) async {
    if (!hasVesselCredential) {
      return const CatchUploadResult.authRequired();
    }
    try {
      final response = await _send(
        _request(
          'POST',
          EndpointGuard.backend(_baseUrl, AqOneConfig.catchLogsPath),
          headers: _withVesselAuth(const <String, String>{
            'Content-Type': 'application/json',
          }),
          body: jsonEncode(payload),
        ),
      )
          .timeout(AqOneConfig.backendTimeout);

      if (response.statusCode == 401 || response.statusCode == 403) {
        clearVesselBearerToken();
        return const CatchUploadResult.authRequired();
      }

      if (response.statusCode == 200 || response.statusCode == 201) {
        String? serverId;
        try {
          final decoded = jsonDecode(response.body);
          if (decoded is Map) {
            final log = decoded['catch_log'];
            final source = log is Map ? log : decoded;
            serverId = source['id']?.toString();
          }
        } catch (_) {
          // A 2xx with an unreadable body still means it was accepted.
        }
        return CatchUploadResult.success(serverId);
      }

      if (response.statusCode >= 400 && response.statusCode < 500) {
        return CatchUploadResult.rejected(
          _catchErrorMessage(response.body, response.statusCode),
        );
      }
      return CatchUploadResult.retry('Server error ${response.statusCode}');
    } catch (_) {
      return const CatchUploadResult.retry('No connection');
    }
  }

  /// Pushes a reweighed, confirmed figure for a catch already on the
  /// backend. Separate from [postCatchLog] on purpose - see
  /// [CatchRecord.toConfirmWeightPayload] - and best-effort in the same way:
  /// a failure here just leaves the confirmation queued for the next sync
  /// tick, so it returns a bare bool rather than the retry/reject
  /// distinction [postCatchLog] needs (there is nothing here the server
  /// could reject on its merits; the only failure mode is connectivity).
  Future<bool> confirmCatchWeight(
    String catchLogId,
    Map<String, Object?> payload,
  ) async {
    if (!hasVesselCredential) {
      return false;
    }
    try {
      final response = await _send(
        _request(
          'POST',
          EndpointGuard.backend(
            _baseUrl,
            '${AqOneConfig.catchLogsPath}/$catchLogId/confirm-weight',
          ),
          headers: _withVesselAuth(const <String, String>{
            'Content-Type': 'application/json',
          }),
          body: jsonEncode(payload),
        ),
      )
          .timeout(AqOneConfig.backendTimeout);
      if (response.statusCode == 401 || response.statusCode == 403) {
        clearVesselBearerToken();
        return false;
      }
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// A clean `{"detail": "..."}` body (FastAPI's own validation-error shape)
  /// is readable as-is and used verbatim. Anything else - an HTML error
  /// page, a stack trace, a body that doesn't parse - falls back to a plain
  /// "Rejected (4xx)" rather than dumping raw server output onto the
  /// fisher's phone.
  /// Uploads one queued fishing-spot report. Mirrors [postCatchLog]'s
  /// retry/reject distinction and idempotency-on-local_id behaviour.
  Future<SpotUploadResult> postFishingSpot(Map<String, Object?> payload) async {
    try {
      final response = await _send(
        _request(
          'POST',
          EndpointGuard.backend(_baseUrl, AqOneConfig.spotsPath),
          headers: const <String, String>{
            'Content-Type': 'application/json',
          },
          body: jsonEncode(payload),
        ),
      )
          .timeout(AqOneConfig.backendTimeout);

      if (response.statusCode == 200 || response.statusCode == 201) {
        String? serverId;
        try {
          final decoded = jsonDecode(response.body);
          if (decoded is Map) {
            final spot = decoded['spot'];
            final source = spot is Map ? spot : decoded;
            serverId = source['id']?.toString();
          }
        } catch (_) {
          // A 2xx with an unreadable body still means it was accepted.
        }
        return SpotUploadResult.success(serverId);
      }

      if (response.statusCode >= 400 && response.statusCode < 500) {
        return SpotUploadResult.rejected(
          _catchErrorMessage(response.body, response.statusCode),
        );
      }
      return SpotUploadResult.retry('Server error ${response.statusCode}');
    } catch (_) {
      return const SpotUploadResult.retry('No connection');
    }
  }

  static String _catchErrorMessage(String body, int statusCode) {
    final trimmed = body.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        final decoded = jsonDecode(trimmed);
        if (decoded is Map) {
          final detail = decoded['detail'];
          if (detail is String && detail.trim().isNotEmpty) {
            return detail.trim();
          }
        } else if (decoded is String && decoded.trim().isNotEmpty) {
          return decoded.trim();
        }
      } catch (_) {
        // Fall through to the generic message below.
      }
    }
    return 'Rejected ($statusCode)';
  }

  http.Request _request(
    String method,
    Uri uri, {
    Map<String, String>? headers,
    String? body,
  }) {
    final request = http.Request(method, uri)
      ..followRedirects = false
      ..maxRedirects = 0;
    if (headers != null) {
      request.headers.addAll(headers);
    }
    if (body != null) {
      request.body = body;
    }
    return request;
  }

  Future<http.Response> _send(http.Request request) async {
    final streamed = await _client.send(request);
    return http.Response.fromStream(streamed);
  }

  Map<String, String> _withVesselAuth([Map<String, String>? headers]) {
    final merged = <String, String>{
      if (headers != null) ...headers,
    };
    final token = _vesselBearerToken;
    if (token != null && token.isNotEmpty) {
      merged['Authorization'] = 'Bearer $token';
    }
    return merged;
  }

  void close() => _client.close();
}

/// Outcome of a single catch-log upload attempt.
class CatchUploadResult {
  const CatchUploadResult._(this.kind, {this.serverId, this.message});

  const CatchUploadResult.success(String? id)
      : this._(CatchUploadKind.success, serverId: id);

  const CatchUploadResult.retry(String reason)
      : this._(CatchUploadKind.retry, message: reason);

  const CatchUploadResult.rejected(String reason)
      : this._(CatchUploadKind.rejected, message: reason);

  const CatchUploadResult.authRequired()
      : this._(CatchUploadKind.authRequired);

  final CatchUploadKind kind;
  final String? serverId;
  final String? message;
}

enum CatchUploadKind { success, retry, rejected, authRequired }

/// Outcome of a single fishing-spot upload attempt. Mirrors
/// [CatchUploadResult] in shape.
class SpotUploadResult {
  const SpotUploadResult._(this.kind, {this.serverId, this.message});

  const SpotUploadResult.success(String? id)
      : this._(SpotUploadKind.success, serverId: id);

  const SpotUploadResult.retry(String reason)
      : this._(SpotUploadKind.retry, message: reason);

  const SpotUploadResult.rejected(String reason)
      : this._(SpotUploadKind.rejected, message: reason);

  final SpotUploadKind kind;
  final String? serverId;
  final String? message;
}

enum SpotUploadKind { success, retry, rejected }
