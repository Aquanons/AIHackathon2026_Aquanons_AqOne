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
  ThemeMode _themeMode = ThemeMode.system;

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
    final identity = await _identityStore.read();
    if (!mounted) {
      return;
    }
    setState(() {
      _identity = identity;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AqOne',
      debugShowCheckedModeBanner: false,
      theme: buildAqTheme(Brightness.light),
      darkTheme: buildAqTheme(Brightness.dark),
      themeMode: _themeMode,
      home: _buildHome(),
    );
  }

  Future<void> _enterApp() async {
    final identity = await _identityStore.read();
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

  void _onLogout() {
    setState(() {
      _identity = null;
      _entered = false;
    });
  }

  void _onIdentityUpdated(VesselIdentity updated) {
    setState(() {
      _identity = updated;
    });
  }

  void _onThemeModeChanged(ThemeMode mode) {
    setState(() {
      _themeMode = mode;
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
      identityStore: _identityStore,
      sos: _service,
      feeds: _feeds,
      location: _location,
      themeMode: _themeMode,
      onThemeModeChanged: _onThemeModeChanged,
      onLogout: _onLogout,
      onIdentityUpdated: _onIdentityUpdated,
    );
  }
}
