import 'dart:async';

import 'package:aqone/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/app_diagnostics.dart';
import 'core/config.dart';
import 'core/l10n_fallback.dart';
import 'core/locale_controller.dart';
import 'core/tokens.dart';
import 'data/app_database.dart';
import 'data/catch_store.dart';
import 'data/checklist_store.dart';
import 'data/fishing_spot_store.dart';
import 'data/identity_store.dart';
import 'data/map_snapshot_store.dart';
import 'data/outbox_store.dart';
import 'services/backend_client.dart';
import 'services/buoy_client.dart';
import 'services/catch_service.dart';
import 'services/fishing_spot_service.dart';
import 'services/location_service.dart';
import 'services/sos_service.dart';
import 'services/venture_feeds.dart';
import 'ui/app_shell.dart';
import 'ui/onboarding_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  AqOneConfig.validateEndpoints();

  // A widget that throws mid-build/layout/paint would otherwise show
  // Flutter's default red screen-of-death - the exact "RenderFlex
  // overflowed by 99381 pixels", "_dependents.isEmpty" kind of text a
  // fisherman at sea has no use for. FlutterError.onError still logs the
  // real details (visible in `flutter run`'s console / any crash reporting
  // added later); only what's drawn on screen changes.
  FlutterError.onError = (FlutterErrorDetails details) {
    FlutterError.presentError(details);
  };
  ErrorWidget.builder = (FlutterErrorDetails details) => const _CrashScreen();

  // Errors thrown outside the widget pipeline - a failed Future or stream
  // callback with nothing downstream to catch it - would otherwise crash
  // the isolate outright rather than show anything. Caught here and logged
  // instead of left to reach the user as a raw stack trace.
  runZonedGuarded(
    () => runApp(const AqOneApp()),
    (error, stack) => AppDiagnostics.log(
      'uncaught',
      error,
      stackTrace: stack,
    ),
  );
}

/// Fallback shown in place of a widget that failed to build.
///
/// Deliberately not themed off [AqPalette] - the ancestor that would have
/// provided it may be exactly what failed to build - so this uses plain,
/// hardcoded colors instead of relying on anything that could itself throw.
class _CrashScreen extends StatelessWidget {
  const _CrashScreen();

  @override
  Widget build(BuildContext context) {
    // Looked up the nullable way rather than through AppLocalizations.of,
    // which asserts when no Localizations ancestor is in scope. This widget
    // replaces one that just failed to build, and the thing that failed may
    // sit above the Localizations scope - so the translation is best-effort
    // and English is the guaranteed floor.
    final AppLocalizations? t =
        Localizations.of<AppLocalizations>(context, AppLocalizations);

    return Material(
      color: const Color(0xFFF8FAFC),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Icon(
                Icons.error_outline_rounded,
                size: 40,
                color: Color(0xFFDC2626),
              ),
              const SizedBox(height: 12),
              Text(
                t?.crashTitle ?? 'Something went wrong',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF1F2937),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                t?.crashBody ??
                    "This part of the screen couldn't load. Try going back, "
                        'or restart the app if it keeps happening.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 13,
                  color: Color(0xFF64748B),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AqOneApp extends StatefulWidget {
  const AqOneApp({super.key});

  @override
  State<AqOneApp> createState() => _AqOneAppState();
}

class _AqOneAppState extends State<AqOneApp> {
  late final AppDatabase _db;
  late final IdentityStore _identityStore;
  late final SosService _service;
  late final CatchService _catches;
  late final ChecklistStore _checklist;
  late final FishingSpotService _spots;
  late final VentureFeeds _feeds;
  late final LocationService _location;
  late final BackendClient _backend;

  VesselIdentity? _identity;
  bool _loading = true;
  bool _entered = false;

  /// Null until the stored language choice has been read. Held rather than
  /// awaited before runApp so a slow preferences read cannot delay first
  /// paint; the loading spinner below covers the gap.
  LocaleController? _locale;

  @override
  void initState() {
    super.initState();
    _db = AppDatabase();
    _identityStore = IdentityStore(_db);
    _location = LocationService();
    _backend = BackendClient();
    _service = SosService(
      outbox: OutboxStore(_db),
      identity: _identityStore,
      buoy: BuoyClient(),
      backend: _backend,
      location: _location,
    );
    _catches = CatchService(
      store: CatchStore(_db),
      identity: _identityStore,
      backend: _backend,
      location: _location,
    );
    _checklist = ChecklistStore(_db);
    // Manual fishing-spot reporting was removed from Venture: hotspots are
    // meant to come from a model over consented catch logs, not from
    // fishers publishing exact productive coordinates to each other. The
    // service is still constructed and started so anything a handset had
    // already queued before the feature went away still uploads instead of
    // being silently discarded. Nothing writes new spots.
    _spots = FishingSpotService(
      store: FishingSpotStore(_db),
      identity: _identityStore,
      backend: _backend,
    );
    // Snapshots make the Venture map usable with no signal: the last good
    // response for each feed is replayed when a fetch fails, so opening
    // the app offshore shows buoys and coverage rather than empty sea.
    _feeds = VentureFeeds(
      backend: _backend,
      snapshots: MapSnapshotStore(_db),
    );
    _restore();
  }

  void _onLocaleChanged() {
    if (mounted) {
      setState(() {});
    }
  }

  @override
  void dispose() {
    _locale?.removeListener(_onLocaleChanged);
    _service.dispose();
    _catches.dispose();
    _spots.dispose();
    _feeds.close();
    _backend.close();
    super.dispose();
  }

  Future<void> _restore() async {
    // Language first: everything after this point may need to render text,
    // and switching locale mid-restore would flash English at the user.
    final controller = await LocaleController.load();
    if (!mounted) {
      return;
    }
    controller.addListener(_onLocaleChanged);
    setState(() => _locale = controller);

    try {
      final identity = await _identityStore.read();
      if (!mounted) {
        return;
      }
      // A returning skipper who asked to be remembered skips the "Welcome
      // back" screen entirely - the details are already on file and asking
      // again on every launch is friction nobody wants from a safety app.
      final remembered = identity != null && identity.isComplete
          ? await _identityStore.getRememberMe()
          : false;
      if (!mounted) {
        return;
      }
      if (remembered) {
        _service.start();
        _catches.start();
        _spots.start();
      }
      setState(() {
        _identity = identity;
        _loading = false;
        _entered = remembered;
      });
    } catch (e) {
      // DB open / query failed (corrupt file, wrong path, platform channel
      // issue).  Rather than spinning forever, let the user through to
      // onboarding where they can re-register.
      AppDiagnostics.log('restore', e);
      if (!mounted) return;
      setState(() {
        _identity = null;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AqOne',
      debugShowCheckedModeBanner: false,

      // Null while preferences are still loading, and null again whenever the
      // user is following their device language - in both cases Flutter
      // resolves against supportedLocales itself, which is what we want.
      locale: _locale?.locale,
      supportedLocales: kSupportedLocales,
      localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        // Must stay last: these claim every locale, so anything above them
        // still gets its real localizations and only `akl` falls through.
        ...kFallbackDelegates,
      ],

      theme: buildAqTheme(Brightness.light),
      darkTheme: buildAqTheme(Brightness.dark),
      // Held here so the theme switch on the profile page can change it.
      // Defaults to the system setting, which is the right default at sea:
      // a phone already in dark mode should not flash a white screen at
      // someone using it at night.
      themeMode: _themeMode,
      home: _buildHome(),
    );
  }

  ThemeMode _themeMode = ThemeMode.system;

  void _setThemeMode(ThemeMode mode) {
    if (mode == _themeMode) {
      return;
    }
    setState(() => _themeMode = mode);
  }

  /// Return to onboarding without erasing the vessel identity.
  ///
  /// The stored profile is deliberately left in place: the vessel id is what
  /// ties this handset to its SOS history on the backend, and wiping it during
  /// a "log out" would orphan any distress call still awaiting a responder.
  /// Onboarding reuses the existing id when the user signs back in.
  void _logout() {
    // Background delivery is deliberately left running.
    //
    // An SOS still sitting in the outbox must keep trying to reach a responder
    // whether or not somebody has tapped "log out" - a distress call is not
    // the user's session to end. start() is idempotent, so signing back in
    // does not double up the timers.
    setState(() => _identity = null);
  }

  Future<void> _enterApp() async {
    VesselIdentity? identity;
    try {
      identity = await _identityStore.read();
    } catch (e) {
      AppDiagnostics.log('enter-app', e);
    }
    if (!mounted) {
      return;
    }
    // Background sync only starts once the user is actually in the app, so a
    // half-finished registration never puts traffic on the wire.
    _service.start();
    _catches.start();
    _spots.start();
    setState(() {
      _identity = identity;
      _entered = true;
    });
  }

  Widget _buildHome() {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final identity = _identity;
    if (!_entered || identity == null || !identity.isComplete) {
      return OnboardingPage(
        identity: _identityStore,
        initialIdentity: identity,
        onReady: _enterApp,
        localeController: _locale,
      );
    }

    return AppShell(
      identity: identity,
      sos: _service,
      catches: _catches,
      checklist: _checklist,
      feeds: _feeds,
      location: _location,
      identityStore: _identityStore,
      themeMode: _themeMode,
      onThemeModeChanged: _setThemeMode,
      localeController: _locale,
      onLogout: _logout,
      onIdentityUpdated: (updated) => setState(() => _identity = updated),
    );
  }
}
