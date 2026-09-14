import 'dart:async';
import 'dart:convert';
import 'package:aqone/core/field_cipher.dart';
import 'package:aqone/main.dart';
import 'package:aqone/data/app_database.dart';
import 'package:aqone/data/identity_store.dart';
import 'package:aqone/data/outbox_store.dart';
import 'package:aqone/data/secure_credential_store.dart';
import 'package:aqone/models/daily_outlook.dart';
import 'package:aqone/models/delivery_state.dart';
import 'package:aqone/models/forecast_outlook.dart';
import 'package:aqone/models/sos_record.dart';
import 'package:aqone/l10n/app_localizations.dart';
import 'package:aqone/services/backend_client.dart';
import 'package:aqone/services/buoy_client.dart';
import 'package:aqone/services/fishing_window.dart';
import 'package:aqone/services/location_service.dart';
import 'package:aqone/services/sos_service.dart';
import 'package:aqone/ui/chathubb.dart';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

class HeldOutbox extends OutboxStore {
  HeldOutbox(super.db);
  final entered = Completer<void>();
  final release = Completer<void>();
  @override
  Future<SosRecord> save(SosRecord record) async {
    if (record.state == DeliveryState.relayed) {
      entered.complete();
      await release.future;
    }
    return super.save(record);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfiNoIsolate;
  late AppDatabase db;
  setUp(() => db = AppDatabase(overridePath: inMemoryDatabasePath));
  tearDown(() async => db.close());

  test('acknowledged SOS retries a failed safe-now reply', () async {
    final outbox = OutboxStore(db);
    await outbox.insert(const SosRecord(localId: 'ack', vesselId: 'v1', boat: 'B', clientTs: 1, state: DeliveryState.acknowledged));
    await outbox.saveResponder('ack', remoteId: '42');
    var attempts = 0;
    final backend = BackendClient(client: MockClient((request) async {
      if (request.url.path.endsWith('/reply')) {
        attempts++;
        return http.Response('{}', attempts == 1 ? 503 : 200);
      }
      return http.Response('{"events": [{"id": 42, "local_id": "ack", "delivery_state": "acknowledged"}]}', 200);
    }))..setVesselBearerToken('test-token');
    final service = SosService(outbox: outbox, identity: IdentityStore(db), backend: backend,
      buoy: BuoyClient(client: MockClient((_) async => http.Response('{}', 503))), location: LocationService());
    await service.replyToSos('ack', 2);
    await service.reconcile();
    await service.reconcile();
    service.dispose();
    backend.close();
    expect(attempts, greaterThan(1));
  });

  test('overlapping SOS saves cannot regress delivered to relayed', () async {
    final outbox = HeldOutbox(db);
    await outbox.insert(const SosRecord(localId: 'race', vesselId: 'v1', boat: 'B', clientTs: 1, state: DeliveryState.saved));
    final earlier = outbox.advance('race', DeliveryState.relayed);
    await outbox.entered.future;
    await outbox.advance('race', DeliveryState.delivered);
    outbox.release.complete();
    await earlier;
    expect((await outbox.byLocalId('race'))!.state, DeliveryState.delivered);
  });

  test('transient secure-store read failure preserves existing encryption key', () async {
    const channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
    final original = List<int>.filled(32, 7);
    String stored = base64Encode(original);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'read') throw PlatformException(code: 'temporarily_unavailable');
      if (call.method == 'write') stored = (call.arguments as Map)['value'] as String;
      return null;
    });
    addTearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));
    final encrypted = await FieldCipher.withKey(original).encrypt('Skipper');
    await SecureCredentialStore().readOrCreateFieldKey();
    expect(await FieldCipher.withKey(base64Decode(stored)).decrypt(encrypted), 'Skipper');
  });

  testWidgets('a stalled keystore cannot block the app behind its launch spinner', (tester) async {
    const channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
    final stalled = Completer<Object?>();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (_) => stalled.future);
    addTearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));
    await tester.pumpWidget(const AqOneApp());
    await tester.pump(const Duration(seconds: 30));
    final spinners = find.byType(CircularProgressIndicator).evaluate().length;
    await tester.pumpWidget(const SizedBox());
    expect(spinners, 0);
  });

  final now = DateTime.utc(2026, 9, 13, 8);
  HourlyInterval hour(int i, {double gust = 10}) => HourlyInterval(time: now.add(Duration(hours: i)), weatherCode: 1, gustKph: gust, waveM: 0.5);
  ForecastOutlook forecast(List<HourlyInterval> hours, {List<DailyOutlook> days = const []}) => ForecastOutlook(days: days, hours: hours, fetchedAt: now, source: 'backend');

  test('earlier daily rain prevents a countdown through that day', () {
    final result = FishingWindowCalculator.calculate(now: now, forecast: forecast([
      for (var i = 1; i <= 49; i++) hour(i, gust: i == 49 ? 35 : 10),
    ], days: [DailyOutlook(date: DateTime.utc(2026, 9, 14), weatherCode: 1, precipMm: 60,
      risk: const RiskAssessment(level: RiskLevel.danger, source: RiskSource.device))]));
    expect(result.durationUntilDeterioration, isNull);
    expect(result.firstAdverseDay, DateTime.utc(2026, 9, 14));
  });

  test('new hazardous interval is current at the exact hour boundary', () {
    final result = FishingWindowCalculator.calculate(now: now, forecast: forecast([hour(0), hour(1, gust: 60), hour(2)]));
    expect(result.currentRisk, RiskLevel.danger);
    expect(result.availability, FishingWindowAvailability.currentDanger);
  });

  test('disconnect during queue flushing retains unsent messages', () async {
    final service = ChatService(displayName: 'Boat');
    await service.sendMessage('msg 1');
    await service.sendMessage('msg 2');
    expect(service.pendingCount, 2);

    service.setConnectedForTesting(true);
    await service.flushQueueForTesting();

    // Socket was null / send failed, flush aborted and retained both messages
    expect(service.pendingCount, 2);
    service.dispose();
  });

  testWidgets('closing chat page cancels wifi poll timer without leaks', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Chathubb(identity: VesselIdentity(vesselId: 'v1', boat: 'TestBoat')),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Pop/replace widget - dispose must cancel wifi timer cleanly
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  test('emergency UI strings resolve in en, fil, and akl', () async {
    final en = await AppLocalizations.delegate.load(const Locale('en'));
    final fil = await AppLocalizations.delegate.load(const Locale('fil'));
    final akl = await AppLocalizations.delegate.load(const Locale('akl'));

    // SOS cancellation & boat setup
    expect(en.sosCancelledNothingSent, 'SOS cancelled. Nothing was sent.');
    expect(fil.sosCancelledNothingSent, 'Kinansela ang SOS. Walang naipadala.');
    expect(akl.sosCancelledNothingSent, 'Ginkansela ro SOS. Waeay it napadaea.');

    expect(en.sosSetupBoatRequired, contains('boat'));
    expect(fil.sosSetupBoatRequired, contains('bangka'));
    expect(akl.sosSetupBoatRequired, contains('baroto'));

    // Responder delay message
    expect(en.responderDelayedStillOnWay, 'Delayed — still on the way');
    expect(fil.responderDelayedStillOnWay, 'Naantala — papunta pa rin');
    expect(akl.responderDelayedStillOnWay, 'Naulang — nagapakadto pa gihapon');
  });
}
