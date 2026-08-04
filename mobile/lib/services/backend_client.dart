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
    final response = await _client.get(uri).timeout(AqOneConfig.backendTimeout);
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
  /// Used by the read-only Venture and Home feeds (buoys, hazards,
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

  void close() => _client.close();
}
