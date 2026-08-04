import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/config.dart';
import '../data/identity_store.dart';
import '../models/buoy_marker.dart';
import '../models/delivery_state.dart';
import '../models/hazard_alert.dart';
import '../models/sos_record.dart';
import '../models/weather_snapshot.dart';
import '../services/location_service.dart';
import '../services/sos_service.dart';
import '../services/venture_feeds.dart';
import 'chathubb.dart';

const Color _brandPrimary = Color(0xFF0F69C9);
const Color _brandDeep = Color(0xFF0B4C8C);
const Color _accentDark = Color(0xFF38BDF8);
const Color _surfaceDark = Color(0xFF1E293B);
const Color _canvasDark = Color(0xFF0F172A);
const Color _danger = Color(0xFFDC2626);
const Color _success = Color(0xFF16A34A);

/// The at-sea operational screen: map, conditions and SOS.
///
/// Ported from the source project's Venture mode, with two deliberate
/// departures:
///   * writes go through the offline outbox instead of straight to HTTP, so
///     an SOS raised out of range is queued rather than lost; and
///   * SOS captures a fresh GPS fix at submission time rather than reusing
///     the map's cached position.
class VenturePage extends StatefulWidget {
  const VenturePage({
    super.key,
    required this.identity,
    required this.sos,
    required this.feeds,
    required this.location,
    this.bottomInset = 0,
  });

  final VesselIdentity identity;
  final SosService sos;
  final VentureFeeds feeds;
  final LocationService location;

  /// Space reserved for the shell's floating dock. The map stays full-bleed
  /// behind it; only the controls are lifted clear so they never get covered.
  final double bottomInset;

  @override
  State<VenturePage> createState() => _VenturePageState();
}

class _VenturePageState extends State<VenturePage> {
  final MapController _mapController = MapController();

  final RequestGuard _weatherGuard = RequestGuard();
  final RequestGuard _buoyGuard = RequestGuard();
  final RequestGuard _waveGuard = RequestGuard();
  final RequestGuard _capsizeGuard = RequestGuard();
  StreamSubscription<void>? _sosSub;
  Timer? _pollTimer;

  double _rotation = 0;
  LatLng? _userLocation;
  bool _isLocating = false;

  WeatherSnapshot? _weather;
  bool _weatherFailed = false;
  bool _safetyDialogShown = false;

  List<BuoyMarker> _buoys = const <BuoyMarker>[];
  final Map<HazardKind, List<HazardAlert>> _hazards =
      <HazardKind, List<HazardAlert>>{};
  final Set<String> _announcedHazardIds = <String>{};

  SosRecord? _latestSos;
  bool _isSendingSos = false;

  bool _isChecklistOpen = false;
  final List<_ChecklistItem> _checklist = <_ChecklistItem>[
    _ChecklistItem('Life jacket'),
    _ChecklistItem('Flashlight'),
    _ChecklistItem('Bailer'),
    _ChecklistItem('Radio check'),
    _ChecklistItem('First aid kit', isDone: true),
  ];
  final TextEditingController _newItem = TextEditingController();

  /// True while a hazard dialog is on screen, so a second alert arriving from
  /// the same poll cannot stack a dialog on top of the first.
  bool _hazardDialogOpen = false;
  final List<HazardKind> _hazardQueue = <HazardKind>[];

  @override
  void initState() {
    super.initState();
    _sosSub = widget.sos.changes.listen((_) => _refreshSosStatus());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _locate(initial: true);
      _loadBuoys();
      _loadHazards();
      _refreshSosStatus();
      _pollTimer = Timer.periodic(AqOneConfig.hazardPollInterval, (_) {
        _loadBuoys();
        _loadHazards();
      });
    });
  }

  @override
  void dispose() {
    // Polling must stop with the screen. Left running it drains battery and
    // keeps hitting the backend while the phone is in a pocket at sea.
    _pollTimer?.cancel();
    _sosSub?.cancel();
    _newItem.dispose();
    _mapController.dispose();
    super.dispose();
  }

  Future<void> _refreshSosStatus() async {
    final history = await widget.sos.history();
    if (!mounted) {
      return;
    }
    setState(() => _latestSos = history.isEmpty ? null : history.first);
  }

  Future<void> _loadWeather(double lat, double lon) async {
    final version = _weatherGuard.begin();
    final snapshot = await widget.feeds.weather(lat: lat, lon: lon);
    if (!mounted || !_weatherGuard.isCurrent(version)) {
      return;
    }
    setState(() {
      _weather = snapshot;
      _weatherFailed = snapshot == null;
    });
    if (!_safetyDialogShown && mounted) {
      _safetyDialogShown = true;
      _showSafetyDialog();
    }
  }

  Future<void> _loadBuoys() async {
    final version = _buoyGuard.begin();
    final buoys = await widget.feeds.buoys();
    if (!mounted || !_buoyGuard.isCurrent(version) || buoys == null) {
      return;
    }
    setState(() => _buoys = buoys);
  }

  Future<void> _loadHazards() async {
    for (final kind in HazardKind.values) {
      final guard = kind == HazardKind.wave ? _waveGuard : _capsizeGuard;
      final version = guard.begin();
      final alerts = await widget.feeds.hazards(kind);
      if (!mounted || !guard.isCurrent(version) || alerts == null) {
        continue;
      }
      final fresh = alerts
          .where((alert) => !_announcedHazardIds.contains(alert.id))
          .toList();
      setState(() => _hazards[kind] = alerts);
      if (fresh.isNotEmpty) {
        _announcedHazardIds.addAll(fresh.map((alert) => alert.id));
        _queueHazardDialog(kind);
      }
    }
  }

  Future<void> _locate({bool initial = false}) async {
    setState(() => _isLocating = true);
    final result = await widget.location.locate();
    if (!mounted) {
      return;
    }
    setState(() => _isLocating = false);

    final fix = result.fix;
    if (fix == null) {
      _snack(result.message);
      // Still show conditions ashore so the screen is not empty.
      if (initial) {
        await _loadWeather(AqOneConfig.aklanLat, AqOneConfig.aklanLon);
      }
      return;
    }

    final point = LatLng(fix.lat, fix.lon);
    setState(() => _userLocation = point);
    _mapController.move(point, AqOneConfig.locatedMapZoom);
    await _loadWeather(fix.lat, fix.lon);
  }

  Future<void> _sendSos() async {
    if (_isSendingSos) {
      return;
    }
    final note = await _confirmSos();
    if (note == null || !mounted) {
      return;
    }

    setState(() => _isSendingSos = true);
    try {
      final record = await widget.sos.raiseSos(note: note);
      if (!mounted) {
        return;
      }
      setState(() => _latestSos = record);
      _snack(
        record.hasFix
            ? 'SOS saved and sending.'
            : 'SOS saved without a GPS fix. It will still be sent.',
      );
    } on StateError {
      if (mounted) {
        _snack('Finish setting up your boat before sending an SOS.');
      }
    } finally {
      if (mounted) {
        setState(() => _isSendingSos = false);
      }
    }
  }

  Future<String?> _confirmSos() async {
    final note = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: <Widget>[
            Icon(Icons.warning_rounded, color: _danger, size: 26),
            SizedBox(width: 10),
            Expanded(child: Text('Send an SOS?')),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              'This alerts the MDRRMO that ${widget.identity.boat} needs '
              'help, and sends your position. Only use this in a real '
              'emergency.',
              style: const TextStyle(fontSize: 14, height: 1.4),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: note,
              maxLength: AqOneConfig.maxNoteLength,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'What is wrong? (optional)',
                hintText: 'engine down',
                counterText: '',
                isDense: true,
              ),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: _danger,
              foregroundColor: Colors.white,
            ),
            child: const Text('Send SOS'),
          ),
        ],
      ),
    );

    final text = note.text;
    note.dispose();
    return confirmed == true ? text : null;
  }

  void _queueHazardDialog(HazardKind kind) {
    if (!_hazardQueue.contains(kind)) {
      _hazardQueue.add(kind);
    }
    _drainHazardQueue();
  }

  Future<void> _drainHazardQueue() async {
    if (_hazardDialogOpen || _hazardQueue.isEmpty || !mounted) {
      return;
    }
    _hazardDialogOpen = true;
    final kind = _hazardQueue.removeAt(0);
    final count = _hazards[kind]?.length ?? 0;

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: <Widget>[
            Icon(kind.icon, color: kind.color, size: 28),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                kind.title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
        content: Text(
          kind.message(count),
          style: const TextStyle(fontSize: 14, height: 1.4),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(
              'Dismiss',
              style: TextStyle(
                color: kind.color,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );

    _hazardDialogOpen = false;
    if (mounted) {
      unawaited(_drainHazardQueue());
    }
  }

  void _showSafetyDialog() {
    final weather = _weather;
    final unsafe = weather?.looksUnsafe ?? true;
    final color = unsafe ? const Color(0xFFD97706) : _success;

    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: <Widget>[
            Icon(
              unsafe ? Icons.error_outline_rounded : Icons.check_circle_outline,
              color: color,
              size: 28,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                unsafe ? 'Take care out there' : 'Conditions look calm',
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              weather == null
                  ? 'Weather could not be loaded, so this cannot be assessed.'
                  : '${weather.condition.label} · '
                      '${weather.temperature.toStringAsFixed(1)}°C · '
                      'wind ${weather.windSpeed.toStringAsFixed(0)} km/h',
              style: const TextStyle(fontSize: 14, height: 1.4),
            ),
            const SizedBox(height: 12),
            // Labelled as informational on purpose. This is a wind and
            // weather-code threshold, not an official assessment, and must
            // not be mistaken for the MDRRMO sea condition.
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF4E0),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                'This is a rough weather check only. Always follow the '
                'official sea condition and advisories before going out.',
                style: TextStyle(
                  fontSize: 11.5,
                  color: Color(0xFF8A5A12),
                  height: 1.35,
                ),
              ),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Got it'),
          ),
        ],
      ),
    );
  }

  void _snack(String message) {
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  // --- Build --------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: <Widget>[
            Positioned.fill(child: _buildMap()),
            Positioned(
              top: 12,
              left: 0,
              right: 0,
              child: _buildWeatherCapsule(isDark),
            ),
            Positioned(
              bottom: 24 + widget.bottomInset,
              right: 16,
              child: _buildActionRail(isDark),
            ),
            if (_isLocating)
              Positioned(
                top: 90,
                left: 0,
                right: 0,
                child: Center(child: _buildLocatingPill(isDark)),
              ),
            if (_isChecklistOpen)
              Positioned(
                bottom: 95 + widget.bottomInset,
                left: 16,
                right: 96,
                child: _buildChecklist(isDark),
              ),
            // Chat Hub FAB — bottom-left, above the attribution.
            Positioned(
              left: 16,
              bottom: 60 + widget.bottomInset,
              child: _buildChatHubButton(isDark),
            ),
            // OSM requires visible attribution. The source project omitted
            // this, which is a licence-compliance gap as well as a courtesy.
            Positioned(
              left: 8,
              bottom: 4 + widget.bottomInset,
              child: _buildAttribution(isDark),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMap() {
    final markers = <Marker>[
      for (final buoy in _buoys)
        Marker(
          point: LatLng(buoy.latitude, buoy.longitude),
          width: 30,
          height: 30,
          alignment: Alignment.center,
          child: Icon(
            Icons.circle_rounded,
            size: 14,
            color: buoy.isActive ? _success : const Color(0xFF9CA3AF),
          ),
        ),
      if (_userLocation != null) _buildUserMarker(_userLocation!),
    ];

    final circles = <CircleMarker>[
      for (final buoy in _buoys)
        CircleMarker(
          point: LatLng(buoy.latitude, buoy.longitude),
          radius: buoy.coverageRadiusMeters,
          useRadiusInMeter: true,
          color: _brandPrimary.withValues(alpha: 0.08),
          borderColor: _brandPrimary.withValues(alpha: 0.25),
          borderStrokeWidth: 1.5,
        ),
    ];

    return FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        // Camera-only default. Never submitted as the user's position.
        initialCenter: _userLocation ??
            const LatLng(AqOneConfig.defaultMapLat, AqOneConfig.defaultMapLon),
        initialZoom: 12.8,
        minZoom: 3,
        maxZoom: 18,
        onMapEvent: (_) {
          final next = _mapController.camera.rotation * (math.pi / 180.0);
          if (next != _rotation && mounted) {
            setState(() => _rotation = next);
          }
        },
      ),
      children: <Widget>[
        TileLayer(
          urlTemplate: AqOneConfig.osmTileUrl,
          userAgentPackageName: 'ph.aqone.app',
        ),
        if (circles.isNotEmpty) CircleLayer(circles: circles),
        MarkerLayer(markers: markers),
      ],
    );
  }

  Marker _buildUserMarker(LatLng point) {
    return Marker(
      point: point,
      width: 50,
      height: 50,
      alignment: Alignment.center,
      child: Stack(
        alignment: Alignment.center,
        children: <Widget>[
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.blue.withValues(alpha: 0.25),
              shape: BoxShape.circle,
            ),
          ),
          Container(
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              color: const Color(0xFF0284C7),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 3),
              boxShadow: <BoxShadow>[
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.3),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWeatherCapsule(bool isDark) {
    final weather = _weather;
    final label = _weatherFailed
        ? 'Weather unavailable'
        : weather?.condition.label ?? 'Loading…';
    final icon = weather?.condition.icon ?? Icons.wb_sunny_rounded;

    return GestureDetector(
      onTap: _showSafetyDialog,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 18),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: (isDark ? _surfaceDark : const Color(0xFFF4F8FA))
              .withValues(alpha: 0.9),
          borderRadius: BorderRadius.circular(30),
          border: Border.all(
            color: (isDark ? _accentDark : Colors.white).withValues(alpha: 0.6),
            width: 1.5,
          ),
          boxShadow: <BoxShadow>[
            BoxShadow(
              color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.06),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: <Widget>[
            Icon(
              icon,
              size: 22,
              color: isDark ? Colors.amber.shade300 : Colors.amber.shade700,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: isDark ? Colors.white : _brandDeep,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              '${weather?.temperature.toStringAsFixed(1) ?? '--'}°C',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w900,
                color: isDark ? Colors.white : _brandDeep,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionRail(bool isDark) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: <Widget>[
        _buildCompass(isDark),
        const SizedBox(height: 6),
        _RoundButton(
          icon: Icons.my_location_rounded,
          tooltip: 'My location',
          isActive: false,
          isDark: isDark,
          onTap: _locate,
        ),
        const SizedBox(height: 10),
        _RoundButton(
          icon: Icons.checklist_rounded,
          tooltip: 'Trip checklist',
          isActive: _isChecklistOpen,
          isDark: isDark,
          onTap: () => setState(() => _isChecklistOpen = !_isChecklistOpen),
        ),
        const SizedBox(height: 14),
        _ActionPill(
          icon: Icons.warning_rounded,
          label: 'SOS',
          color: _danger,
          isDark: isDark,
          onTap: _isSendingSos ? null : _sendSos,
        ),
        if (_latestSos != null) _buildSosStatus(isDark, _latestSos!),
      ],
    );
  }

  Widget _buildSosStatus(bool isDark, SosRecord record) {
    final state = record.state;
    final color = switch (state) {
      DeliveryState.saved => const Color(0xFFD97706),
      DeliveryState.relayed => _brandPrimary,
      DeliveryState.delivered => const Color(0xFF0284C7),
      DeliveryState.acknowledged => _success,
    };
    return Container(
      margin: const EdgeInsets.only(top: 8),
      constraints: const BoxConstraints(maxWidth: 190),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: (isDark ? _canvasDark : Colors.white).withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: <Widget>[
          Text(
            state.title,
            textAlign: TextAlign.right,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            state.description,
            textAlign: TextAlign.right,
            style: TextStyle(
              fontSize: 10,
              height: 1.25,
              color: isDark ? Colors.white70 : const Color(0xFF475569),
            ),
          ),
          if (!record.hasFix)
            const Padding(
              padding: EdgeInsets.only(top: 3),
              child: Text(
                'No GPS fix recorded',
                textAlign: TextAlign.right,
                style: TextStyle(fontSize: 9.5, color: Color(0xFFD97706)),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildCompass(bool isDark) {
    return GestureDetector(
      onTap: () => _mapController.rotate(0),
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: (isDark ? _canvasDark : Colors.white).withValues(alpha: 0.9),
          shape: BoxShape.circle,
          border: Border.all(
            color: isDark ? _accentDark : _brandPrimary,
            width: 1.5,
          ),
        ),
        child: Transform.rotate(
          angle: _rotation,
          child: Icon(
            Icons.navigation_rounded,
            size: 20,
            color: isDark ? _accentDark : _brandPrimary,
          ),
        ),
      ),
    );
  }

  Widget _buildLocatingPill(bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? _surfaceDark : Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 8,
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: isDark ? _accentDark : _brandDeep,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            'Locating…',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : Colors.black87,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAttribution(bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      color: (isDark ? Colors.black : Colors.white).withValues(alpha: 0.6),
      child: Text(
        AqOneConfig.osmAttribution,
        style: TextStyle(
          fontSize: 9,
          color: isDark ? Colors.white70 : const Color(0xFF475569),
        ),
      ),
    );
  }

  // --- Chat Hub FAB (bottom-left) — iOS Messages icon shape ---
  Widget _buildChatHubButton(bool isDark) {
    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => const Chathubb()),
      ),
      child: SizedBox(
        width: 58,
        height: 62,
        child: CustomPaint(
          size: const Size(58, 62),
          painter: const _BubbleTailPainter(),
          child: const Align(
            alignment: Alignment.topLeft,
            child: Padding(
              padding: EdgeInsets.only(left: 13, top: 11),
              child: Icon(
                Icons.waves_rounded,
                color: Colors.white,
                size: 24,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildChecklist(bool isDark) {
    return Material(
      elevation: 6,
      borderRadius: BorderRadius.circular(16),
      color: isDark ? _surfaceDark : Colors.white,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 280),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Icon(
                    Icons.checklist_rounded,
                    size: 18,
                    color: isDark ? _accentDark : _brandPrimary,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Trip checklist',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: isDark ? Colors.white : _canvasDark,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, size: 18),
                    onPressed: () => setState(() => _isChecklistOpen = false),
                  ),
                ],
              ),
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: _checklist.length,
                  itemBuilder: (context, index) {
                    final item = _checklist[index];
                    return Row(
                      children: <Widget>[
                        Checkbox(
                          value: item.isDone,
                          onChanged: (value) => setState(
                            () => item.isDone = value ?? false,
                          ),
                        ),
                        Expanded(
                          child: Text(
                            item.title,
                            style: TextStyle(
                              fontSize: 13,
                              decoration: item.isDone
                                  ? TextDecoration.lineThrough
                                  : null,
                              color: isDark ? Colors.white : _canvasDark,
                            ),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline, size: 18),
                          onPressed: () =>
                              setState(() => _checklist.removeAt(index)),
                        ),
                      ],
                    );
                  },
                ),
              ),
              Row(
                children: <Widget>[
                  Expanded(
                    child: TextField(
                      controller: _newItem,
                      style: const TextStyle(fontSize: 13),
                      decoration: const InputDecoration(
                        isDense: true,
                        hintText: 'Add an item',
                      ),
                      onSubmitted: (_) => _addChecklistItem(),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.add_rounded),
                    onPressed: _addChecklistItem,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _addChecklistItem() {
    final text = _newItem.text.trim();
    if (text.isEmpty) {
      return;
    }
    setState(() {
      _checklist.add(_ChecklistItem(text));
      _newItem.clear();
    });
  }
}

class _ChecklistItem {
  _ChecklistItem(this.title, {this.isDone = false});

  final String title;
  bool isDone;
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.icon,
    required this.tooltip,
    required this.isActive,
    required this.isDark,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final bool isActive;
  final bool isDark;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final primary = isDark ? _accentDark : _brandPrimary;
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        label: tooltip,
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color:
                  (isActive ? primary : (isDark ? _canvasDark : Colors.white))
                      .withValues(alpha: 0.9),
              shape: BoxShape.circle,
              border: Border.all(color: primary, width: 1.5),
              boxShadow: <BoxShadow>[
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.15),
                  blurRadius: 6,
                ),
              ],
            ),
            child: Icon(
              icon,
              size: 18,
              color: isActive ? Colors.white : primary,
            ),
          ),
        ),
      ),
    );
  }
}

class _ActionPill extends StatelessWidget {
  const _ActionPill({
    required this.icon,
    required this.label,
    required this.color,
    required this.isDark,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color color;
  final bool isDark;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    final display = enabled
        ? color
        : (isDark ? const Color(0xFF334155) : const Color(0xFF94A3B8));
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: display.withValues(alpha: 0.4),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ElevatedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 20, color: Colors.white),
        label: Text(
          label,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w900,
            color: Colors.white,
            letterSpacing: 0.3,
          ),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: display,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        ),
      ),
    );
  }
}

/// Draws the iOS-style speech bubble with a connected tail as one silhouette.
class _BubbleTailPainter extends CustomPainter {
  const _BubbleTailPainter();

  static const _blue = Color(0xFF64B5F6);
  static const _bodyWidth = 50.0;
  static const _bodyHeight = 46.0;

  @override
  void paint(Canvas canvas, Size size) {
    // Body — rounded rectangle.
    final body = ui.Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(0, 0, _bodyWidth, _bodyHeight),
          const Radius.circular(18),
        ),
      );

    // Tail — triangle whose top edge is buried inside the body so the union
    // is a single connected silhouette.
    final tail = ui.Path()
      ..moveTo(14, 44)
      ..lineTo(24, 46)
      ..lineTo(6, 60)
      ..close();

    final shape = ui.Path.combine(ui.PathOperation.union, body, tail);

    canvas.drawPath(shape, Paint()..color = _blue);
    canvas.drawPath(
      shape,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(covariant _BubbleTailPainter old) => false;
}
