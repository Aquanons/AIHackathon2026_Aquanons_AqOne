// Uses the Phase 0 contract fixtures in fixtures/week1_contract/ (see
// docs/21_WEEK1_CONTRACT_FIXTURES.md) as the single source of truth for what
// the buoy firmware actually sends, rather than re-typing JSON bodies here
// that could drift from the fixtures.
import 'dart:convert';
import 'dart:io';

import 'package:aqone/models/delivery_state.dart';
import 'package:aqone/models/sos_record.dart';
import 'package:aqone/services/buoy_client.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _fixture(String name) {
  final file = File('../fixtures/week1_contract/$name');
  return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
}

SosRecord _record() {
  return const SosRecord(
    localId: 'local-1',
    vesselId: 'fisher-7f3a',
    boat: 'BG-123',
    clientTs: 1755248500,
    state: DeliveryState.saved,
  );
}

void main() {
  group('BuoyClient.handoff', () {
    test('parses an accepted SOS per fixtures/week1_contract/accepted_sos.json',
        () async {
      final fixture = _fixture('accepted_sos.json');
      final body = fixture['response']['body'] as Map<String, dynamic>;

      final client = BuoyClient(
        baseUrl: 'http://192.168.4.1',
        client: MockClient((request) async {
          expect(request.url.toString(), 'http://192.168.4.1/v1/sos');
          return http.Response(jsonEncode(body), 200);
        }),
      );

      final ack = await client.handoff(_record());

      expect(ack.accepted, isTrue);
      // buoy_id is the firmware's string constant, not a number - the whole
      // point of this fixture (see docs/21_WEEK1_CONTRACT_FIXTURES.md).
      expect(ack.buoyId, 'BUOY01');
      expect(ack.seq, 42);
    });

    test('throws BuoyRejected(503) on a full queue per fixtures/week1_contract/queue_full.json',
        () async {
      final fixture = _fixture('queue_full.json');
      final response = fixture['response'] as Map<String, dynamic>;
      final status = response['status'] as int;
      final body = response['body'] as Map<String, dynamic>;

      final client = BuoyClient(
        baseUrl: 'http://192.168.4.1',
        client: MockClient(
          (request) async => http.Response(jsonEncode(body), status),
        ),
      );

      await expectLater(
        client.handoff(_record()),
        throwsA(
          isA<BuoyRejected>()
              .having((e) => e.statusCode, 'statusCode', 503)
              .having((e) => e.reason, 'reason', 'buoy queue full'),
        ),
      );
    });

    test('throws BuoyUnreachable when the buoy cannot be reached (fixtures/week1_contract/buoy_offline.json)',
        () async {
      final client = BuoyClient(
        baseUrl: 'http://192.168.4.1',
        client: MockClient((request) async {
          throw const SocketException('No route to host');
        }),
      );

      await expectLater(
        client.handoff(_record()),
        throwsA(isA<BuoyUnreachable>()),
      );
    });

    test('throws BuoyInvalidResponse on a body the firmware truncated mid-JSON',
        () async {
      // The firmware caches responder replies in a fixed 320-byte buffer and
      // serves whatever is in it verbatim - a response longer than that is
      // truncated mid-JSON (see fixtures/week1_contract/eta_acknowledged.json
      // "_notes"). handoff() must report this distinctly from "unreachable"
      // so the fisher and a field debugger are not told a buoy that answered
      // is out of range.
      const truncated = '{"accepted": true, "buoy_id": "BUOY01", "se';

      final client = BuoyClient(
        baseUrl: 'http://192.168.4.1',
        client: MockClient((request) async => http.Response(truncated, 200)),
      );

      await expectLater(
        client.handoff(_record()),
        throwsA(isA<BuoyInvalidResponse>()),
      );
    });

    test('throws BuoyRejected when the buoy says accepted:false', () async {
      final client = BuoyClient(
        baseUrl: 'http://192.168.4.1',
        client: MockClient(
          (request) async => http.Response(
            jsonEncode(<String, Object?>{'accepted': false}),
            200,
          ),
        ),
      );

      await expectLater(
        client.handoff(_record()),
        throwsA(isA<BuoyRejected>()),
      );
    });
  });

  group('BuoyClient.status', () {
    test('parses the real firmware GET /v1/status shape honestly', () async {
      // No batt/mesh fields - the firmware does not send them
      // (docs/21_WEEK1_CONTRACT_FIXTURES.md). A test that expected them would
      // be testing an imaginary contract.
      final client = BuoyClient(
        baseUrl: 'http://192.168.4.1',
        client: MockClient(
          (request) async => http.Response(
            jsonEncode(<String, Object?>{
              'buoy_id': 'BUOY01',
              'uplink': false,
              'queue_depth': 2,
              'clients': 1,
              'uptime_s': 4213,
            }),
            200,
          ),
        ),
      );

      final status = await client.status();

      expect(status.buoyId, 'BUOY01');
      expect(status.uplink, isFalse);
      expect(status.queueDepth, 2);
      expect(status.clients, 1);
    });

    test('throws BuoyRejected on a non-200 status', () async {
      final client = BuoyClient(
        baseUrl: 'http://192.168.4.1',
        client: MockClient(
          (request) async => http.Response('Internal Server Error', 500),
        ),
      );

      await expectLater(client.status(), throwsA(isA<BuoyRejected>()));
    });
  });
}
