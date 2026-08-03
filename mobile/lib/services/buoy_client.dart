import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config.dart';
import '../models/buoy_contact.dart';
import '../models/sos_record.dart';

class BuoyUnreachable implements Exception {
  const BuoyUnreachable(this.reason);
  final String reason;
  @override
  String toString() => 'BuoyUnreachable: $reason';
}

class BuoyRejected implements Exception {
  const BuoyRejected(this.statusCode, this.reason);
  final int statusCode;
  final String reason;
  @override
  String toString() => 'BuoyRejected($statusCode): $reason';
}

class BuoyClient {
  BuoyClient({http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? AqOneConfig.buoyBaseUrl;

  final http.Client _client;
  final String _baseUrl;

  Future<BuoyStatus> status() async {
    final uri = Uri.parse('$_baseUrl/v1/status');
    try {
      final response =
          await _client.get(uri).timeout(AqOneConfig.buoyTimeout);
      if (response.statusCode != 200) {
        throw BuoyRejected(response.statusCode, 'status query failed');
      }
      return BuoyStatus.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>,
      );
    } on BuoyRejected {
      rethrow;
    } catch (error) {
      throw BuoyUnreachable(error.toString());
    }
  }

  Future<BuoyAck> handoff(SosRecord record) async {
    final uri = Uri.parse('$_baseUrl/v1/sos');
    http.Response response;
    try {
      response = await _client
          .post(
            uri,
            headers: const <String, String>{
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: jsonEncode(record.toBuoyPayload()),
          )
          .timeout(AqOneConfig.buoyTimeout);
    } catch (error) {
      throw BuoyUnreachable(error.toString());
    }

    if (response.statusCode == 503) {
      throw const BuoyRejected(503, 'buoy queue full');
    }
    if (response.statusCode != 200) {
      throw BuoyRejected(response.statusCode, 'unexpected buoy response');
    }

    final ack = BuoyAck.fromJson(
      jsonDecode(response.body) as Map<String, dynamic>,
    );
    if (!ack.accepted) {
      throw const BuoyRejected(200, 'buoy did not accept the SOS');
    }
    return ack;
  }

  void close() => _client.close();
}
