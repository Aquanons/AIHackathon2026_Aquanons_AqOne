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

/// The buoy answered - it is reachable and not rejecting the request - but
/// the body was not a JSON object with the fields we expect. Distinct from
/// [BuoyUnreachable] on purpose: an unreachable buoy and a buoy sending
/// garbage need different handling (retry vs. "something is wrong with this
/// buoy's firmware"), and conflating them was hiding which one was actually
/// happening in the field.
///
/// The firmware caches responder ETA replies in a fixed 320-byte buffer
/// (`char payload[320]` in `.ino`) and can truncate mid-JSON - see
/// `fixtures/week1_contract/eta_acknowledged.json`. This is a real, expected
/// failure mode, not a hypothetical one.
class BuoyInvalidResponse implements Exception {
  const BuoyInvalidResponse(this.reason);
  final String reason;
  @override
  String toString() => 'BuoyInvalidResponse: $reason';
}

class BuoyClient {
  BuoyClient({http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? AqOneConfig.buoyBaseUrl;

  final http.Client _client;
  final String _baseUrl;

  Future<BuoyStatus> status() async {
    final uri = Uri.parse('$_baseUrl/v1/status');
    http.Response response;
    try {
      response = await _client.get(uri).timeout(AqOneConfig.buoyTimeout);
    } catch (error) {
      throw BuoyUnreachable(error.toString());
    }

    if (response.statusCode != 200) {
      throw BuoyRejected(response.statusCode, 'status query failed');
    }
    return _decode(response.body, BuoyStatus.fromJson);
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

    final ack = _decode(response.body, BuoyAck.fromJson);
    if (!ack.accepted) {
      throw const BuoyRejected(200, 'buoy did not accept the SOS');
    }
    return ack;
  }

  /// Parses a 200 response body. A malformed or truncated body is a real
  /// buoy-firmware failure mode (see [BuoyInvalidResponse]), not a transport
  /// failure, so it must not be reported to the fisher as "no buoy nearby."
  T _decode<T>(String body, T Function(Map<String, dynamic>) fromJson) {
    final Object? decoded;
    try {
      decoded = jsonDecode(body);
    } catch (error) {
      throw BuoyInvalidResponse('not valid JSON: $error');
    }
    if (decoded is! Map<String, dynamic>) {
      throw const BuoyInvalidResponse('expected a JSON object');
    }
    try {
      return fromJson(decoded);
    } catch (error) {
      throw BuoyInvalidResponse('unexpected shape: $error');
    }
  }

  void close() => _client.close();
}
