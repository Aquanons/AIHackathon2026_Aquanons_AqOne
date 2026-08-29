import 'package:aqone/core/l10n_fallback.dart';
import 'package:aqone/data/app_database.dart';
import 'package:aqone/data/identity_store.dart';
import 'package:aqone/data/outbox_store.dart';
import 'package:aqone/l10n/app_localizations.dart';
import 'package:aqone/models/delivery_state.dart';
import 'package:aqone/models/sos_record.dart';
import 'package:aqone/services/backend_client.dart';
import 'package:aqone/services/buoy_client.dart';
import 'package:aqone/services/location_service.dart';
import 'package:aqone/services/sos_service.dart';
import 'package:aqone/ui/widgets/responder_eta_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

/// Overrides only the one method ResponderEtaDialog actually calls. The base
/// class's real dependencies (OutboxStore, BackendClient, ...) are
/// constructed but never touched - their I/O is entirely lazy, and this
/// override never calls `super.replyToSos()` - so no database or network
/// ever opens, which sidesteps sqflite_common_ffi's poor interaction with
/// testWidgets' FakeAsync zone (see sos_service_test.dart for the real thing
/// tested against a real in-memory database, outside a widget test).
class _FakeSosService extends SosService {
  _FakeSosService()
      : super(
          outbox: OutboxStore(AppDatabase()),
          identity: IdentityStore(AppDatabase()),
          buoy: BuoyClient(),
          backend: BackendClient(),
          location: LocationService(),
        );

  final List<int> replies = <int>[];

  /// Mirrors the real method's contract: true once the backend has it,
  /// false when it is only saved locally and will retry via reconcile().
  bool sendsDirectly = true;

  @override
  Future<bool> replyToSos(String localId, int reply) async {
    replies.add(reply);
    return sendsDirectly;
  }
}

SosRecord _buildRecord({
  int? etaMinutesFromNow,
  int? responderStatus,
  String? responderNote,
}) {
  return SosRecord(
    localId: 'local-1',
    vesselId: 'fisher-7f3a',
    boat: 'BG-123',
    clientTs: 1755248500,
    state: DeliveryState.acknowledged,
    etaAt: etaMinutesFromNow == null
        ? null
        : DateTime.now().add(Duration(minutes: etaMinutesFromNow)).toIso8601String(),
    responderStatus: responderStatus,
    responderNote: responderNote,
  );
}

Widget _host(Widget child) {
  return MaterialApp(
    locale: const Locale('en'),
    supportedLocales: kSupportedLocales,
    localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
      ...kFallbackDelegates,
    ],
    home: Scaffold(body: child),
  );
}

void main() {
  testWidgets('an acknowledged SOS shows the responder status and ETA', (tester) async {
    final record = _buildRecord(etaMinutesFromNow: 20, responderStatus: 2);

    await tester.pumpWidget(_host(ResponderEtaDialog(record: record, sos: _FakeSosService())));
    await tester.pump();

    expect(find.text('Rescue boat on the way'), findsOneWidget);
    expect(find.text('ARRIVING IN'), findsOneWidget);
    expect(find.textContaining(':'), findsWidgets);
  });

  testWidgets('an expired ETA says delayed, never 00:00 or a negative countdown', (tester) async {
    final record = _buildRecord(etaMinutesFromNow: -5, responderStatus: 5);

    await tester.pumpWidget(_host(ResponderEtaDialog(record: record, sos: _FakeSosService())));
    await tester.pump();

    expect(find.text('ARRIVAL OVERDUE'), findsOneWidget);
    expect(find.text('Delayed — still on the way'), findsOneWidget);
    expect(find.textContaining('00:00'), findsNothing);
    expect(find.textContaining('-'), findsNothing);
  });

  testWidgets('Still in danger invokes reply 1 immediately, no confirmation needed', (tester) async {
    final record = _buildRecord(etaMinutesFromNow: 20, responderStatus: 2);
    final fakeSos = _FakeSosService();

    await tester.pumpWidget(_host(ResponderEtaDialog(record: record, sos: fakeSos)));
    await tester.pump();

    await tester.tap(find.text('Still in danger'));
    await tester.pump();
    await tester.pump();

    expect(fakeSos.replies, <int>[1]);
    expect(find.text('MDRRMO knows you are still waiting for help.'), findsOneWidget);
  });

  testWidgets('Safe now requires confirmation and invokes reply 2 only after', (tester) async {
    final record = _buildRecord(etaMinutesFromNow: 20, responderStatus: 2);
    final fakeSos = _FakeSosService();

    await tester.pumpWidget(_host(ResponderEtaDialog(record: record, sos: fakeSos)));
    await tester.pump();

    await tester.tap(find.text('Safe now'));
    await tester.pump();

    // Tapping "Safe now" only opens the confirmation - nothing sent yet.
    expect(fakeSos.replies, isEmpty);
    expect(find.textContaining('no longer need rescue'), findsOneWidget);

    await tester.tap(find.text("Yes, I'm safe"));
    await tester.pump();
    await tester.pump();

    expect(fakeSos.replies, <int>[2]);
    expect(find.text('MDRRMO has been told you are safe.'), findsOneWidget);
  });

  testWidgets('a reply that could not reach the backend shows a queued explanation', (tester) async {
    final record = _buildRecord(etaMinutesFromNow: 20, responderStatus: 2);
    final fakeSos = _FakeSosService()..sendsDirectly = false;

    await tester.pumpWidget(_host(ResponderEtaDialog(record: record, sos: fakeSos)));
    await tester.pump();

    await tester.tap(find.text('Still in danger'));
    await tester.pump();
    await tester.pump();

    expect(fakeSos.replies, <int>[1]);
    expect(
      find.text('Not sent yet — will send automatically once you have a connection.'),
      findsOneWidget,
    );
  });

  testWidgets('cancelling the Safe now confirmation sends nothing', (tester) async {
    final record = _buildRecord(etaMinutesFromNow: 20, responderStatus: 2);
    final fakeSos = _FakeSosService();

    await tester.pumpWidget(_host(ResponderEtaDialog(record: record, sos: fakeSos)));
    await tester.pump();

    await tester.tap(find.text('Safe now'));
    await tester.pump();
    await tester.tap(find.text('Cancel'));
    await tester.pump();

    expect(fakeSos.replies, isEmpty);
    expect(find.text('Still in danger'), findsOneWidget);
  });
}
