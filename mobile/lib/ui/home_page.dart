import 'dart:async';

import 'package:flutter/material.dart';

import '../core/config.dart';
import '../core/tokens.dart';
import '../data/identity_store.dart';
import '../models/advisory.dart';
import '../models/buoy_contact.dart';
import '../models/sea_condition.dart';
import '../models/sos_record.dart';
import '../models/weather_snapshot.dart';
import '../services/location_service.dart';
import '../services/sos_service.dart';
import '../services/venture_feeds.dart';
import 'widgets/advisory_card.dart';
import 'widgets/buoy_status_card.dart';
import 'widgets/delivery_state_tile.dart';
import 'widgets/sea_condition_banner.dart';
import 'widgets/weather_card.dart';

class HomePage extends StatefulWidget {
  const HomePage({
    super.key,
    required this.service,
    required this.identity,
    required this.feeds,
    required this.location,
    this.bottomInset = 0,
    this.onOpenAdvisories,
    this.onOpenProfile,
  });

  final SosService service;
  final VesselIdentity identity;
  final VentureFeeds feeds;
  final LocationService location;

  /// Space reserved for the shell's floating dock, so the last card is not
  /// hidden underneath it.
  final double bottomInset;

  /// Opens the full advisories list. Null hides the "View all" action rather
  /// than leaving a control that navigates nowhere.
  final VoidCallback? onOpenAdvisories;
  final VoidCallback? onOpenProfile;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  List<SosRecord> _records = const <SosRecord>[];
  BuoyStatus? _buoy;
  Timer? _buoyTimer;
  Timer? _seaTimer;
  StreamSubscription<void>? _changes;

  SeaCondition? _sea;
  bool _seaLoading = true;
  List<Advisory> _advisories = const <Advisory>[];
  WeatherSnapshot? _weather;
  bool _weatherLoading = true;

  /// Whether the current reading is for the device position or the fallback.
  bool _weatherAtDevice = false;

  @override
  void initState() {
    super.initState();
    _changes = widget.service.changes.listen((_) => _loadRecords());
    widget.service.start();
    _loadRecords();
    _pollBuoy();
    _loadSea();
    _loadAdvisories();
    _loadWeather();
    _buoyTimer = Timer.periodic(
      AqOneConfig.buoyPollInterval,
      (_) => _pollBuoy(),
    );
    _seaTimer = Timer.periodic(
      AqOneConfig.seaConditionInterval,
      (_) => _loadSea(),
    );
  }

  @override
  void dispose() {
    _buoyTimer?.cancel();
    _seaTimer?.cancel();
    _changes?.cancel();
    super.dispose();
  }

  Future<void> _loadSea() async {
    final sea = await widget.feeds.seaCondition();
    if (!mounted) {
      return;
    }
    setState(() {
      _seaLoading = false;
      if (sea != null) {
        _sea = sea;
      }
    });
  }

  Future<void> _loadAdvisories() async {
    final advisories = await widget.feeds.advisories();
    if (!mounted || advisories == null) {
      return;
    }
    setState(() => _advisories = advisories);
  }

  Future<void> _loadWeather() async {
    if (mounted) {
      setState(() => _weatherLoading = true);
    }

    final fix = await widget.location.cachedFixIfPermitted();
    final weather = await widget.feeds.weather(
      lat: fix?.lat ?? AqOneConfig.aklanLat,
      lon: fix?.lon ?? AqOneConfig.aklanLon,
    );
    if (!mounted) {
      return;
    }
    setState(() {
      _weatherLoading = false;
      _weatherAtDevice = fix != null;
      if (weather != null) {
        _weather = weather;
      }
    });
  }

  Future<void> _loadRecords() async {
    final records = await widget.service.history();
    if (!mounted) {
      return;
    }
    setState(() => _records = records);
  }

  Future<void> _pollBuoy() async {
    final status = await widget.service.pollBuoy();
    if (!mounted) {
      return;
    }
    setState(() => _buoy = status);
  }

  void _openWiFiSelection() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => const _WiFiSelectionScreen(),
      ),
    );
    _pollBuoy();
  }

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    final displayName = widget.identity.skipperName.trim().isNotEmpty
        ? widget.identity.skipperName.trim()
        : widget.identity.boat;
    return Scaffold(
      backgroundColor: palette.canvas,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () async {
            await _pollBuoy();
            await _loadSea();
            await _loadAdvisories();
            await _loadWeather();
            await widget.service.retryPending();
            await widget.service.reconcile();
            await _loadRecords();
          },
          child: ListView(
            padding: EdgeInsets.fromLTRB(
              AqSpace.screen,
              AqSpace.lg,
              AqSpace.screen,
              AqSpace.xl + widget.bottomInset,
            ),
            children: <Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: <Widget>[
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                            color: palette.primaryText,
                          ),
                        ),
                        const SizedBox(height: AqSpace.xs),
                        Text(
                          'AqOne distress beacon',
                          style: TextStyle(
                            fontSize: 14,
                            color: palette.secondaryText,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AqSpace.base),
                  Semantics(
                    button: true,
                    label: 'Open fisherman profile',
                    child: InkWell(
                      onTap: widget.onOpenProfile,
                      customBorder: const CircleBorder(),
                      child: Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: palette.surface,
                          border: Border.all(color: palette.border),
                          boxShadow: <BoxShadow>[
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.06),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Icon(
                          Icons.person_rounded,
                          color: palette.secondaryText,
                          size: 28,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              if (widget.identity.skipperName.trim().isNotEmpty) ...<Widget>[
                const SizedBox(height: 2),
                Text(
                  widget.identity.boat,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13,
                    color: palette.secondaryText,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
              const SizedBox(height: AqSpace.lg),
              SeaConditionBanner(condition: _sea, isLoading: _seaLoading),
              const SizedBox(height: AqSpace.base),
              WeatherCard(
                snapshot: _weather,
                isLoading: _weatherLoading,
                onRetry: _loadWeather,
                locationLabel:
                    _weatherAtDevice ? 'your position' : 'Aklan (default)',
              ),
              if (_weather != null) ...<Widget>[
                const SizedBox(height: AqSpace.base),
                Container(
                  padding: const EdgeInsets.all(AqSpace.md),
                  decoration: BoxDecoration(
                    color: Colors.green.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.green.shade400),
                  ),
                  child: Text(
                    "The WEATHER IS ${_weather!.conditionText.toUpperCase()} ITS SAFE TO FISH",
                    style: TextStyle(
                      color: Colors.green.shade700,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
              if (_advisories.isNotEmpty) ...<Widget>[
                const SizedBox(height: AqSpace.base),
                AdvisoryCard(
                  advisory: _advisories.first,
                  remaining: _advisories.length - 1,
                  onViewAll: widget.onOpenAdvisories,
                ),
              ],
              const SizedBox(height: AqSpace.base),
              GestureDetector(
                onTap: _openWiFiSelection,
                behavior: HitTestBehavior.opaque,
                child: BuoyStatusCard(status: _buoy),
              ),
              const SizedBox(height: AqSpace.screen),
              Text(
                'Your messages',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: palette.primaryText,
                ),
              ),
              const SizedBox(height: AqSpace.md),
              if (_records.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: AqSpace.xl),
                  child: Text(
                    'No SOS sent yet.',
                    style: TextStyle(fontSize: 14, color: palette.dimText),
                  ),
                )
              else
                ..._records.map(
                  (record) => DeliveryStateTile(record: record),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ==========================================
// BUOY WIFI SELECTION PAGE
// ==========================================

class _BuoyNetworkItem {
  final String ssid;
  final int signalStrength;
  bool isConnected;

  _BuoyNetworkItem({
    required this.ssid,
    required this.signalStrength,
    this.isConnected = false,
  });
}

class _WiFiSelectionScreen extends StatefulWidget {
  const _WiFiSelectionScreen();

  @override
  State<_WiFiSelectionScreen> createState() => _WiFiSelectionScreenState();
}

class _WiFiSelectionScreenState extends State<_WiFiSelectionScreen> {
  bool _isScanning = false;
  String? _connectingSsid;

  final List<_BuoyNetworkItem> _networks = [
    _BuoyNetworkItem(ssid: 'AqOne-Buoy-Alpha-01', signalStrength: 88),
    _BuoyNetworkItem(ssid: 'AqOne-Buoy-Bravo-04', signalStrength: 65),
    _BuoyNetworkItem(ssid: 'AqOne-Buoy-CoastGuard-02', signalStrength: 42),
  ];

  void _scan() async {
    setState(() => _isScanning = true);
    await Future<void>.delayed(const Duration(seconds: 2));
    if (!mounted) return;
    setState(() => _isScanning = false);
  }

  void _toggleConnect(_BuoyNetworkItem item) async {
    if (item.isConnected) {
      setState(() => item.isConnected = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Disconnected from ${item.ssid}'),
          duration: const Duration(seconds: 2),
        ),
      );
    } else {
      setState(() => _connectingSsid = item.ssid);
      await Future<void>.delayed(const Duration(seconds: 2));
      if (!mounted) return;
      setState(() {
        for (final net in _networks) {
          net.isConnected = false;
        }
        item.isConnected = true;
        _connectingSsid = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Connected to ${item.ssid}'),
          backgroundColor: Colors.green.shade700,
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  IconData _wifiIcon(int signal) {
    if (signal > 75) return Icons.wifi_rounded;
    if (signal > 40) return Icons.wifi_2_bar_rounded;
    return Icons.wifi_1_bar_rounded;
  }

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);

    return Scaffold(
      backgroundColor: palette.canvas,
      appBar: AppBar(
        backgroundColor: palette.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: Text(
          'Buoy Wi-Fi Networks',
          style: TextStyle(
            color: palette.primaryText,
            fontWeight: FontWeight.bold,
          ),
        ),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: palette.primaryText),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(
            icon: _isScanning
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: palette.primaryText,
                    ),
                  )
                : Icon(Icons.refresh_rounded, color: palette.primaryText),
            onPressed: _isScanning ? null : _scan,
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AqSpace.screen,
            vertical: AqSpace.md,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Available nearby buoys',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: palette.secondaryText,
                ),
              ),
              const SizedBox(height: AqSpace.md),
              Expanded(
                child: ListView.separated(
                  itemCount: _networks.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AqSpace.sm),
                  itemBuilder: (context, index) {
                    final item = _networks[index];
                    final isBusy = _connectingSsid == item.ssid;

                    return Container(
                      decoration: BoxDecoration(
                        color: palette.surface,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: item.isConnected
                              ? Colors.green.shade400
                              : palette.border,
                          width: item.isConnected ? 1.5 : 1.0,
                        ),
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: AqSpace.lg,
                          vertical: AqSpace.xs,
                        ),
                        leading: Icon(
                          _wifiIcon(item.signalStrength),
                          color: item.isConnected
                              ? Colors.green.shade400
                              : palette.primaryText,
                          size: 28,
                        ),
                        title: Text(
                          item.ssid,
                          style: TextStyle(
                            color: palette.primaryText,
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                        subtitle: Text(
                          item.isConnected
                              ? 'Connected'
                              : 'Signal strength: ${item.signalStrength}%',
                          style: TextStyle(
                            color: item.isConnected
                                ? Colors.green.shade400
                                : palette.secondaryText,
                            fontSize: 13,
                          ),
                        ),
                        trailing: isBusy
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : OutlinedButton(
                                style: OutlinedButton.styleFrom(
                                  side: BorderSide(
                                    color: item.isConnected
                                        ? Colors.red.shade400
                                        : palette.border,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                ),
                                onPressed: _connectingSsid != null
                                    ? null
                                    : () => _toggleConnect(item),
                                child: Text(
                                  item.isConnected ? 'Disconnect' : 'Connect',
                                  style: TextStyle(
                                    color: item.isConnected
                                        ? Colors.red.shade400
                                        : palette.primaryText,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}