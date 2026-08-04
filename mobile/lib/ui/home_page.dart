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

  /// A failed refresh keeps the last known value on screen. The banner marks
  /// it as possibly outdated rather than blanking - during bad weather, an
  /// old "not advised" is far more useful than no reading at all.
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

  /// Weather for wherever the boat actually is.
  ///
  /// Uses the device position when location permission is already granted -
  /// showing port conditions to someone who is already out at sea would be
  /// worse than useless. Falls back to the municipal position otherwise, and
  /// the card says which one is being shown so the reading is never
  /// ambiguous.
  ///
  /// Deliberately does not request permission here: Home is the first screen
  /// after registration, and a location prompt with no explanation is how
  /// people end up denying it permanently. Venture asks properly, in context,
  /// and from then on Home follows the device.
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

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    final displayName = widget.identity.skipperName.trim().isNotEmpty
        ? widget.identity.skipperName.trim()
        : widget.identity.boat;
    return Scaffold(
      backgroundColor: palette.canvas,
      body: SafeArea(
        // bottomInset already covers the system inset, so letting SafeArea
        // add it again would double-pad the bottom of the list.
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
              // The official call sits above everything else on the screen.
              SeaConditionBanner(condition: _sea, isLoading: _seaLoading),
              const SizedBox(height: AqSpace.base),
              WeatherCard(
                snapshot: _weather,
                isLoading: _weatherLoading,
                onRetry: _loadWeather,
                locationLabel:
                    _weatherAtDevice ? 'your position' : 'Aklan (default)',
              ),
              if (_advisories.isNotEmpty) ...<Widget>[
                const SizedBox(height: AqSpace.base),
                AdvisoryCard(
                  advisory: _advisories.first,
                  remaining: _advisories.length - 1,
                  onViewAll: widget.onOpenAdvisories,
                ),
              ],
              const SizedBox(height: AqSpace.base),
              BuoyStatusCard(status: _buoy),
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