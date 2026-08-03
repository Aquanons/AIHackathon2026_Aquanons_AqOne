import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config.dart';
import '../models/delivery_state.dart';

class RemoteSos {
  const RemoteSos({
    required this.id,
    required this.deliveryState,
    this.seq,
    this.acknowledgedAt,
    this.ackedBy,
  });

  final String id;
  final DeliveryState deliveryState;
  final int? seq;
  final String? acknowledgedAt;
  final String? ackedBy;

  static RemoteSos fromJson(Map<String, dynamic> json) {
    final status = json['status'] as String?;
    final declared = DeliveryState.fromWire(json['delivery_state'] as String?);
    final resolved = status == 'acknowledged'
        ? declared.merge(DeliveryState.acknowledged)
        : declared;
    return RemoteSos(
      id: json['id']?.toString() ?? '',
      deliveryState: resolved,
      seq: (json['seq'] as num?)?.toInt(),
      acknowledgedAt: json['acknowledged_at'] as String?,
      ackedBy: json['acked_by'] as String?,
    );
  }
}

class BackendClient {
  BackendClient({http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? AqOneConfig.backendBaseUrl;

  final http.Client _client;
  final String _baseUrl;

  Future<bool> isReachable() async {
    try {
      final response = await _client
          .get(Uri.parse('$_baseUrl/healthz'))
          .timeout(AqOneConfig.backendTimeout);
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<List<RemoteSos>> vesselSos(String vesselId) async {
    final uri = Uri.parse(
      '$_baseUrl/api/v1/vessels/${Uri.encodeComponent(vesselId)}/sos',
    );
    final response =
        await _client.get(uri).timeout(AqOneConfig.backendTimeout);
    if (response.statusCode != 200) {
      return const <RemoteSos>[];
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      return const <RemoteSos>[];
    }
    final rows = decoded['sos'];
    if (rows is! List) {
      return const <RemoteSos>[];
    }
    return rows
        .whereType<Map<String, dynamic>>()
        .map(RemoteSos.fromJson)
        .toList(growable: false);
  }

  /// Generic authenticated-ish GET returning a decoded body, or null.
  ///
  /// Used by the read-only Venture and Home feeds (spots, buoys, hazards,
  /// advisories, sea condition). Returns null rather than throwing so a
  /// caller polling every 30 seconds does not need a try/catch at each site;
  /// a failed poll simply leaves the previous data on screen.
  Future<Object?> getJson(String path) async {
    try {
      final response = await _client
          .get(Uri.parse('$_baseUrl$path'))
          .timeout(AqOneConfig.backendTimeout);
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
    try {
      final response = await _client
          .post(
            Uri.parse('$_baseUrl${AqOneConfig.catchLogsPath}'),
            headers: const <String, String>{
              'Content-Type': 'application/json',
            },
            body: jsonEncode(payload),
          )
          .timeout(AqOneConfig.backendTimeout);

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
          _errorMessage(response.body, response.statusCode),
        );
      }
      return CatchUploadResult.retry('Server error ${response.statusCode}');
    } catch (_) {
      return const CatchUploadResult.retry('No connection');
    }
  }

  static String _errorMessage(String body, int statusCode) {
    final trimmed = body.trim();
    if (trimmed.isEmpty) {
      return 'Rejected ($statusCode)';
    }
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
        // Fall through to the raw text.
      }
    }
    return trimmed.length <= 120 ? trimmed : trimmed.substring(0, 120);
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

  final CatchUploadKind kind;
  final String? serverId;
  final String? message;
}

enum CatchUploadKind { success, retry, rejected }
