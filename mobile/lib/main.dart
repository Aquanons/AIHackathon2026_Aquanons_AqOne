import 'package:flutter/material.dart';

import 'core/tokens.dart';
import 'data/app_database.dart';
import 'data/identity_store.dart';
import 'data/outbox_store.dart';
import 'services/backend_client.dart';
import 'services/buoy_client.dart';
import 'services/location_service.dart';
import 'services/sos_service.dart';
import 'ui/home_page.dart';
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

  VesselIdentity? _identity;
  bool _loading = true;
  bool _entered = false;

  @override
  void initState() {
    super.initState();
    _db = AppDatabase();
    _identityStore = IdentityStore(_db);
    _service = SosService(
      outbox: OutboxStore(_db),
      identity: _identityStore,
      buoy: BuoyClient(),
      backend: BackendClient(),
      location: LocationService(),
    );
    _restore();
  }

  @override
  void dispose() {
    _service.dispose();
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
      home: _buildHome(),
    );
  }

  Future<void> _enterApp() async {
    final identity = await _identityStore.read();
    if (!mounted) {
      return;
    }
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

    return HomePage(service: _service, identity: identity);
  }
}
