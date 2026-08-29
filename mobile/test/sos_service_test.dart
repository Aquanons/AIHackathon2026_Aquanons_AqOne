import 'dart:convert';

import 'package:aqone/data/app_database.dart';
import 'package:aqone/data/identity_store.dart';
import 'package:aqone/data/outbox_store.dart';
import 'package:aqone/models/delivery_state.dart';
import 'package:aqone/models/sos_record.dart';
import 'package:aqone/services/backend_client.dart';
import 'package:aqone/services/buoy_client.dart';
import 'package:aqone/services/location_service.dart';
import 'package:aqone/services/sos_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

class _FakeBackendClient extends http.BaseClient {
  _FakeBackendClient(this._handler);

  final Future<http.StreamedResponse> Function(http.BaseRequest request)
      _handler;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) =>
      _handler(request);
}

Future<http.StreamedResponse> _direct(int statusCode) async {
  return http.StreamedResponse(
    Stream<List<int>>.value(utf8.encode('{}')),
    statusCode,
  );
}

SosRecord _record(String localId) {
  return SosRecord(
    localId: localId,
    vesselId: 'fisher-7f3a',
    boat: 'BG-123',
    clientTs: 1755248500,
    state: DeliveryState.saved,
  );
}

void main() {
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

  late AppDatabase db;
  late OutboxStore outbox;

  setUp(() {
    db = AppDatabase(overridePath: inMemoryDatabasePath);
    outbox = OutboxStore(db);
  });

  tearDown(() async {
    await db.close();
  });

  SosService buildService({
    required BuoyClient buoy,
    required BackendClient backend,
  }) {
    return SosService(
      outbox: outbox,
      identity: IdentityStore(db),
      buoy: buoy,
      backend: backend,
      location: LocationService(),
    );
  }

  test('direct-only success advances the record to delivered', () async {
    final record = _record('local-direct-only');
    await outbox.insert(record);

    final buoy = BuoyClient(
      baseUrl: 'http://192.168.4.1',
      client: MockClient((request) async {
        throw const FormatException('no buoy in range');
      }),
    );
    final backend = BackendClient(
      client: _FakeBackendClient((_) => _direct(200)),
    );

    final service = buildService(buoy: buoy, backend: backend);
    await service.retryPending();

    final updated = await outbox.byLocalId(record.localId);
    expect(updated!.state, DeliveryState.delivered);
    expect(updated.buoyId, isNull);
  });

  test('buoy-only success advances the record to relayed with buoy metadata',
      () async {
    final record = _record('local-buoy-only');
    await outbox.insert(record);

    final buoy = BuoyClient(
      baseUrl: 'http://192.168.4.1',
      client: MockClient((request) async {
        return http.Response(
          jsonEncode(<String, Object?>{
            'accepted': true,
            'buoy_id': 'BUOY01',
            'seq': 42,
            'server_ts': 172963201,
          }),
          200,
        );
      }),
    );
    final backend = BackendClient(
      client: _FakeBackendClient((_) async {
        throw Exception('no internet connection');
      }),
    );

    final service = buildService(buoy: buoy, backend: backend);
    await service.retryPending();

    final updated = await outbox.byLocalId(record.localId);
    expect(updated!.state, DeliveryState.relayed);
    expect(updated.buoyId, 'BUOY01');
    expect(updated.seq, 42);
  });

  test(
      'both routes succeeding finishes at delivered without losing buoy metadata',
      () async {
    final record = _record('local-both-succeed');
    await outbox.insert(record);

    final buoy = BuoyClient(
      baseUrl: 'http://192.168.4.1',
      client: MockClient((request) async {
        return http.Response(
          jsonEncode(<String, Object?>{
            'accepted': true,
            'buoy_id': 'BUOY01',
            'seq': 42,
            'server_ts': 172963201,
          }),
          200,
        );
      }),
    );
    final backend = BackendClient(
      client: _FakeBackendClient((_) => _direct(200)),
    );

    final service = buildService(buoy: buoy, backend: backend);
    await service.retryPending();

    final updated = await outbox.byLocalId(record.localId);
    expect(updated!.state, DeliveryState.delivered);
    // The direct success must not have wiped out what the buoy already
    // recorded - see SosService._attemptRelay()'s doc comment.
    expect(updated.buoyId, 'BUOY01');
    expect(updated.seq, 42);
  });

  test('both routes failing leaves the record at saved with a useful reason',
      () async {
    final record = _record('local-both-fail');
    await outbox.insert(record);

    final buoy = BuoyClient(
      baseUrl: 'http://192.168.4.1',
      client: MockClient((request) async {
        throw const FormatException('unreachable');
      }),
    );
    final backend = BackendClient(
      client: _FakeBackendClient((_) async {
        throw Exception('no internet connection');
      }),
    );

    final service = buildService(buoy: buoy, backend: backend);
    await service.retryPending();

    final updated = await outbox.byLocalId(record.localId);
    expect(updated!.state, DeliveryState.saved);
    expect(updated.attempts, greaterThan(0));
    expect(updated.lastError, isNotNull);
    expect(updated.lastError, isNotEmpty);
  });
}
