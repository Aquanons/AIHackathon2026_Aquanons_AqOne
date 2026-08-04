import 'package:flutter/material.dart';

import 'core/tokens.dart';
import 'data/app_database.dart';
import 'data/identity_store.dart';
import 'data/outbox_store.dart';
import 'services/backend_client.dart';
import 'services/buoy_client.dart';
import 'services/location_service.dart';
import 'services/sos_service.dart';
import 'services/venture_feeds.dart';
import 'ui/app_shell.dart';
import 'ui/onboarding_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AqOneApp());
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
  late final VentureFeeds _feeds;
  late final LocationService _location;
  late final BackendClient _backend;

  VesselIdentity? _identity;
  bool _loading = true;
  bool _entered = false;

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
    _feeds = VentureFeeds(backend: _backend);
    _restore();
  }

  @override
  void dispose() {
    _service.dispose();
    _feeds.close();
    _backend.close();
    super.dispose();
  }

  Future<void> _restore() async {
    try {
      final identity = await _identityStore.read();
      if (!mounted) {
        return;
      }
      setState(() {
        _identity = identity;
        _loading = false;
      });
    } catch (e) {
      // DB open / query failed (corrupt file, wrong path, platform channel
      // issue).  Rather than spinning forever, let the user through to
      // onboarding where they can re-register.
      debugPrint('AqOne: _restore failed — $e');
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
      debugPrint('AqOne: _enterApp read failed — $e');
    }
    if (!mounted) {
      return;
    }
    // Background sync only starts once the user is actually in the app, so a
    // half-finished registration never puts traffic on the wire.
    _service.start();
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
      );
    }

    return AppShell(
      identity: identity,
      sos: _service,
      feeds: _feeds,
      location: _location,
      identityStore: _identityStore,
      themeMode: _themeMode,
      onThemeModeChanged: _setThemeMode,
      onLogout: _logout,
      onIdentityUpdated: (updated) => setState(() => _identity = updated),
    );
  }
}
