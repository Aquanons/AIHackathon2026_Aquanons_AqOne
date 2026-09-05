import 'package:aqone/core/config.dart';
import 'package:aqone/core/l10n_fallback.dart';
import 'package:aqone/data/app_database.dart';
import 'package:aqone/data/catch_store.dart';
import 'package:aqone/data/checklist_store.dart';
import 'package:aqone/data/identity_store.dart';
import 'package:aqone/data/map_snapshot_store.dart';
import 'package:aqone/data/outbox_store.dart';
import 'package:aqone/l10n/app_localizations.dart';
import 'package:aqone/models/advisory.dart';
import 'package:aqone/models/buoy_contact.dart';
import 'package:aqone/models/buoy_marker.dart';
import 'package:aqone/models/catch_record.dart';
import 'package:aqone/models/daily_outlook.dart';
import 'package:aqone/models/hotspot_cell.dart';
import 'package:aqone/models/sea_condition.dart';
import 'package:aqone/models/sos_record.dart';
import 'package:aqone/models/squall_watch.dart';
import 'package:aqone/models/weather_snapshot.dart';
import 'package:aqone/services/backend_client.dart';
import 'package:aqone/services/buoy_client.dart';
import 'package:aqone/services/catch_service.dart';
import 'package:aqone/services/location_service.dart';
import 'package:aqone/services/sos_service.dart';
import 'package:aqone/services/venture_feeds.dart';
import 'package:aqone/ui/home_page.dart';
import 'package:aqone/ui/venture_page.dart';
import 'package:aqone/ui/widgets/squall_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeSosService extends SosService {
  _FakeSosService()
      : super(
          outbox: OutboxStore(AppDatabase()),
          identity: IdentityStore(AppDatabase()),
          buoy: BuoyClient(),
          backend: BackendClient(),
          location: LocationService(),
        );

  @override
  void start() {}

  @override
  Future<List<SosRecord>> history() async => const <SosRecord>[];

  @override
  Future<BuoyStatus?> pollBuoy() async => null;
}

class _FakeCatchService extends CatchService {
  _FakeCatchService()
      : super(
          store: CatchStore(AppDatabase()),
          identity: IdentityStore(AppDatabase()),
          backend: BackendClient(),
          location: LocationService(),
        );

  @override
  void start() {}

  @override
  Future<int> pendingCount() async => 0;

  @override
  Future<CatchRecord?> mostRecent() async => null;

  @override
  Future<List<CatchRecord>> history() async => const <CatchRecord>[];
}

class _FakeLocationService extends LocationService {
  @override
  Future<Fix?> cachedFixIfPermitted() async => null;

  @override
  Future<LocationResult> locate({Duration? timeout}) async =>
      const LocationResult.failed(LocationFailure.servicesDisabled);
}

class _FakeVentureFeeds extends VentureFeeds {
  _FakeVentureFeeds()
      : super(
          backend: BackendClient(),
          snapshots: MapSnapshotStore(AppDatabase()),
        );

  @override
  Future<SeaCondition?> seaCondition() async => null;

  @override
  Future<List<Advisory>?> advisories() async => const <Advisory>[];

  @override
  Future<WeatherSnapshot?> weather({required double lat, required double lon}) async => null;

  @override
  Future<List<DailyOutlook>?> forecast({
    required double lat,
    required double lon,
    String? municipality,
  }) async =>
      const <DailyOutlook>[];

  @override
  Future<List<BuoyMarker>?> buoys() async => const <BuoyMarker>[];

  @override
  Future<HotspotSurface?> hotspots() async => null;

  @override
  Future<SquallWatch> squall() async => SquallWatch.unavailable;
}

const VesselIdentity _testIdentity = VesselIdentity(
  vesselId: 'test-vessel-123',
  boat: 'Test Boat',
  skipperName: 'Test Skipper',
  phone: '09123456789',
);

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
    home: Scaffold(
      body: SizedBox(
        width: 800,
        height: 600,
        child: child,
      ),
    ),
  );
}

void main() {
  group('Normal mode verification (PITCH_MODE=false)', () {
    testWidgets('deferred controls remain available in normal development mode', (
      WidgetTester tester,
    ) async {
      if (AqOneConfig.pitchMode) {
        return;
      }

      await tester.pumpWidget(
        _host(
          HomePage(
            service: _FakeSosService(),
            catches: _FakeCatchService(),
            identity: _testIdentity,
            feeds: _FakeVentureFeeds(),
            location: _FakeLocationService(),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('Catch analysis'), findsOneWidget);

      await tester.pumpWidget(
        _host(
          VenturePage(
            identity: _testIdentity,
            sos: _FakeSosService(),
            catches: _FakeCatchService(),
            checklist: ChecklistStore(AppDatabase()),
            feeds: _FakeVentureFeeds(),
            location: _FakeLocationService(),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('SOS'), findsOneWidget);
      expect(find.text('Log Catch'), findsOneWidget);
      expect(find.byTooltip("Today's catches"), findsOneWidget);

      // Clean up widget tree
      await tester.pumpWidget(const SizedBox());
    });
  });

  group('Pitch mode verification (PITCH_MODE=true)', () {
    testWidgets(
      'manual SOS is present while catch, hotspot and squall UI are absent',
      (WidgetTester tester) async {
        if (!AqOneConfig.pitchMode) {
          return;
        }

        // 1. Home page in pitch mode: Catch analysis is absent
        await tester.pumpWidget(
          _host(
            HomePage(
              service: _FakeSosService(),
              catches: _FakeCatchService(),
              identity: _testIdentity,
              feeds: _FakeVentureFeeds(),
              location: _FakeLocationService(),
            ),
          ),
        );
        await tester.pump();
        expect(find.text('Catch analysis'), findsNothing);
        expect(find.byType(SquallBanner), findsNothing);

        // 2. Venture page in pitch mode: SOS present, catch and squall absent
        await tester.pumpWidget(
          _host(
            VenturePage(
              identity: _testIdentity,
              sos: _FakeSosService(),
              catches: _FakeCatchService(),
              checklist: ChecklistStore(AppDatabase()),
              feeds: _FakeVentureFeeds(),
              location: _FakeLocationService(),
            ),
          ),
        );
        await tester.pump();
        expect(find.text('SOS'), findsOneWidget);
        expect(find.text('Log Catch'), findsNothing);
        expect(find.byTooltip("Today's catches"), findsNothing);
        expect(find.text('Repeat'), findsNothing);
        expect(find.textContaining('waiting to upload'), findsNothing);
        expect(find.byType(SquallBanner), findsNothing);
        expect(find.textContaining('catch reports'), findsNothing);

        // Clean up widget tree
        await tester.pumpWidget(const SizedBox());
      },
    );
  });
}
