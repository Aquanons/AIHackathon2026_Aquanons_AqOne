import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/config.dart';
import '../data/checklist_store.dart';
import '../data/identity_store.dart';
import '../models/buoy_marker.dart';
import '../models/catch_record.dart';
import '../models/delivery_state.dart';
import '../models/hazard_alert.dart';
import '../models/sos_record.dart';
import '../models/weather_snapshot.dart';
import '../services/catch_service.dart';
import '../services/location_service.dart';
import '../services/sos_alarm.dart';
import '../services/sos_service.dart';
import '../services/venture_feeds.dart';
import 'catch_history_page.dart';
import 'chathubb.dart';
import 'checklist_page.dart';

const Color _brandPrimary = Color(0xFF0F69C9);
const Color _brandDeep = Color(0xFF0B4C8C);
const Color _accentDark = Color(0xFF38BDF8);
const Color _surfaceDark = Color(0xFF1E293B);
const Color _canvasDark = Color(0xFF0F172A);
const Color _danger = Color(0xFFDC2626);
const Color _success = Color(0xFF16A34A);

/// How long a fisher has to slide-to-cancel before the SOS actually sends.
/// Short enough to still read as "immediate" - the button does not gate the
/// alert behind typing a note - but long enough that a pocket tap can be
/// caught before anything reaches the MDRRMO.
const Duration _sosCountdown = Duration(seconds: 4);

/// Preset emergency types offered on the post-dispatch follow-up. Picking
/// one amends the note already on file with the MDRRMO; it never delays the
/// SOS itself, which has already gone out by the time this is shown.
enum _EmergencyType {
  engine('Engine failure', Icons.settings_suggest_rounded),
  capsizing('Capsizing / taking on water', Icons.waves_rounded),
  medical('Medical emergency', Icons.medical_services_rounded),
  other('Other', Icons.edit_note_rounded);

  const _EmergencyType(this.label, this.icon);

  final String label;
  final IconData icon;
}

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
    required this.catches,
    required this.checklist,
    required this.feeds,
    required this.location,
    this.bottomInset = 0,
  });

  final VesselIdentity identity;
  final SosService sos;
  final CatchService catches;
  final ChecklistStore checklist;
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
  final SosAlarm _sosAlarm = SosAlarm();

  int _pendingCatches = 0;
  CatchRecord? _lastCatch;
  bool _repeatingCatch = false;
  StreamSubscription<void>? _catchSub;

  /// True while a hazard dialog is on screen, so a second alert arriving from
  /// the same poll cannot stack a dialog on top of the first.
  bool _hazardDialogOpen = false;
  final List<HazardKind> _hazardQueue = <HazardKind>[];

  @override
  void initState() {
    super.initState();
    _sosSub = widget.sos.changes.listen((_) => _refreshSosStatus());
    _catchSub = widget.catches.changes.listen((_) => _refreshCatchCount());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _locate(initial: true);
      _loadBuoys();
      _loadHazards();
      _refreshSosStatus();
      _refreshCatchCount();
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
    _catchSub?.cancel();
    _mapController.dispose();
    unawaited(_sosAlarm.dispose());
    super.dispose();
  }

  Future<void> _refreshCatchCount() async {
    final count = await widget.catches.pendingCount();
    final last = await widget.catches.mostRecent();
    if (!mounted) {
      return;
    }
    setState(() {
      _pendingCatches = count;
      _lastCatch = last;
    });
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

  /// Tapping the SOS pill starts the alarm immediately and a short,
  /// cancellable countdown - it does not wait on any dialog or typed note.
  /// Only once the countdown runs out (uninterrupted) does anything actually
  /// go to the MDRRMO; the "what's wrong?" detail is gathered afterwards,
  /// while the alert is already in flight.
  Future<void> _handleSosTap() async {
    if (_isSendingSos) {
      return;
    }

    setState(() => _isSendingSos = true);
    unawaited(_sosAlarm.start());

    final shouldSend = await _runSosCountdown();
    if (!mounted) {
      return;
    }

    if (!shouldSend) {
      unawaited(_sosAlarm.stop());
      setState(() => _isSendingSos = false);
      _snack('SOS cancelled. Nothing was sent.');
      return;
    }

    try {
      // Sent with no note - the alert itself must never wait on the fisher
      // typing anything. The follow-up sheet attaches detail afterwards.
      final record = await widget.sos.raiseSos();
      if (!mounted) {
        return;
      }
      setState(() => _latestSos = record);
      await _showEmergencyDetailsSheet(record);
    } on StateError {
      if (mounted) {
        _snack('Finish setting up your boat before sending an SOS.');
      }
    } finally {
      unawaited(_sosAlarm.stop());
      if (mounted) {
        setState(() => _isSendingSos = false);
      }
    }
  }

  /// Full-screen countdown with a slide-to-cancel control. Returns true if
  /// the countdown ran out (dispatch), false if the fisher cancelled -
  /// before anything was sent either way.
  Future<bool> _runSosCountdown() async {
    final result = await showGeneralDialog<bool>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black87,
      transitionDuration: const Duration(milliseconds: 150),
      pageBuilder: (ctx, __, ___) =>
          const _SosCountdownScreen(duration: _sosCountdown),
    );
    return result ?? false;
  }

  /// Shown immediately after dispatch, while the alarm keeps ringing: lets
  /// the fisher attach what's actually wrong, or stand the alert down if it
  /// was raised by mistake. Either action stops the alarm; so does just
  /// leaving it on the "already sent" state and closing without picking
  /// anything.
  Future<void> _showEmergencyDetailsSheet(SosRecord record) async {
    if (!mounted) {
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _EmergencyDetailsSheet(
        boat: widget.identity.boat,
        onSubmitNote: (note) async {
          try {
            final updated = await widget.sos.amendNote(record.localId, note);
            if (mounted) {
              setState(() => _latestSos = updated);
            }
          } catch (_) {
            // Best-effort per amendNote()'s own contract - the note is
            // already saved locally regardless of whether this succeeded.
          }
        },
        onStandDown: () async {
          await widget.sos.standDown(record.localId);
          if (mounted) {
            _snack('SOS stood down.');
          }
        },
      ),
    );
    unawaited(_sosAlarm.stop());
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
                unsafe ? 'Wind above threshold' : 'Conditions look calm',
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
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF4E0),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'Source: Open-Meteo · threshold '
                    '${AqOneConfig.unsafeWindKph.toStringAsFixed(0)} km/h. '
                    'This is not a PAGASA warning. '
                    'Always follow the official sea condition and advisories.',
                style: const TextStyle(
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
              child: Column(
                children: <Widget>[
                  _buildWeatherCapsule(isDark),
                  if (_latestSos != null) ...<Widget>[
                    const SizedBox(height: 8),
                    _buildSosStatus(isDark, _latestSos!),
                  ],
                ],
              ),
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
          isActive: false,
          isDark: isDark,
          onTap: _openChecklist,
        ),
        const SizedBox(height: 10),
        // Chat sits immediately above SOS rather than in its own corner, so
        // every action on this screen is reachable from one thumb position.
        _RoundButton(
          icon: Icons.chat_bubble_rounded,
          tooltip: 'Chat with nearby boats',
          isActive: false,
          isDark: isDark,
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => const Chathubb()),
          ),
        ),
        const SizedBox(height: 10),
        _RoundButton(
          icon: Icons.receipt_long_rounded,
          tooltip: "Today's catches",
          isActive: false,
          isDark: isDark,
          onTap: _openCatchHistory,
        ),
        const SizedBox(height: 10),
        if (_lastCatch != null) ...<Widget>[
          _ActionPill(
            icon: Icons.replay_rounded,
            label: 'Repeat: ${_lastCatchLabel(_lastCatch!)}',
            color: const Color(0xFF0EA5A4),
            isDark: isDark,
            onTap: _repeatingCatch ? null : _repeatLastCatch,
          ),
          const SizedBox(height: 8),
        ],
        _ActionPill(
          icon: Icons.edit_note_rounded,
          label: 'Log Catch',
          color: const Color(0xFF0284C7),
          isDark: isDark,
          onTap: _showCatchSheet,
        ),
        if (_pendingCatches > 0)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: GestureDetector(
              onTap: _openCatchHistory,
              child: Text(
                '$_pendingCatches waiting to upload',
                style: TextStyle(
                  fontSize: 10.5,
                  decoration: TextDecoration.underline,
                  color: isDark ? Colors.white70 : const Color(0xFF475569),
                ),
              ),
            ),
          ),
        const SizedBox(height: 14),
        _ActionPill(
          icon: Icons.warning_rounded,
          label: 'SOS',
          color: _danger,
          isDark: isDark,
          onTap: _isSendingSos ? null : _handleSosTap,
        ),
      ],
    );
  }

  // --- Catch log ------------------------------------------------------------

  Future<void> _showCatchSheet() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _CatchLogSheet(catches: widget.catches),
    );
    if (saved == true && mounted) {
      await _refreshCatchCount();
      _snack('Catch saved. It uploads when you have signal.');
    }
  }

  /// One tap, no sheet at all: logs another of whatever was just logged,
  /// same species and the same weight preset. The fast path for the common
  /// case of pulling in several of the same fish in a row.
  Future<void> _repeatLastCatch() async {
    final last = _lastCatch;
    if (last == null || _repeatingCatch) {
      return;
    }
    setState(() => _repeatingCatch = true);
    try {
      await widget.catches.logCatch(
        speciesName: last.speciesName,
        estimatedQuantityKg: last.estimatedQuantityKg,
      );
      if (!mounted) {
        return;
      }
      await _refreshCatchCount();
      _snack('Logged another ${_lastCatchLabel(last)}.');
    } catch (_) {
      if (mounted) {
        _snack('Could not repeat that catch.');
      }
    } finally {
      if (mounted) {
        setState(() => _repeatingCatch = false);
      }
    }
  }

  String _lastCatchLabel(CatchRecord record) {
    final species = record.speciesName?.trim();
    final name = species == null || species.isEmpty ? 'catch' : species;
    final weight = record.estimatedQuantityKg;
    final weightLabel =
        weight == weight.roundToDouble() ? '${weight.toInt()}' : '$weight';
    return '$name ~${weightLabel}kg';
  }

  Future<void> _openCatchHistory() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CatchHistoryPage(catches: widget.catches),
      ),
    );
    await _refreshCatchCount();
  }

  Future<void> _openChecklist() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ChecklistPage(checklist: widget.checklist),
      ),
    );
  }

  Widget _buildSosStatus(bool isDark, SosRecord record) {
    final state = record.state;
    final standDown = record.isStoodDown;
    final color = standDown
        ? const Color(0xFF64748B)
        : switch (state) {
            DeliveryState.saved => const Color(0xFFD97706),
            DeliveryState.relayed => _brandPrimary,
            DeliveryState.delivered => const Color(0xFF0284C7),
            DeliveryState.acknowledged => _success,
          };
    final title = standDown ? 'Stood down' : state.title;
    final description = standDown
        ? 'Marked as a false alarm - the MDRRMO has been told to disregard.'
        : state.description;
    final icon = standDown
        ? Icons.undo_rounded
        : switch (state) {
            DeliveryState.saved => Icons.hourglass_top_rounded,
            DeliveryState.relayed => Icons.sync_rounded,
            DeliveryState.delivered => Icons.cloud_done_rounded,
            DeliveryState.acknowledged => Icons.check_circle_rounded,
          };

    return Container(
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
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'SOS: $title',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
                Text(
                  description,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 10.5,
                    color: isDark ? Colors.white70 : const Color(0xFF475569),
                  ),
                ),
              ],
            ),
          ),
          if (!record.hasFix) ...<Widget>[
            const SizedBox(width: 8),
            const Icon(
              Icons.gps_off_rounded,
              size: 15,
              color: Color(0xFFD97706),
            ),
          ],
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

/// Full-screen "sending SOS in N…" countdown with a slide-to-cancel bar.
///
/// Deliberately not a plain [AlertDialog]: this has to be impossible to
/// dismiss by accident (no tap-outside, no back-gesture - see [PopScope]
/// below) while still being trivially easy to cancel on purpose via the
/// slide, which is a large, deliberate, hard-to-trigger-by-accident gesture.
class _SosCountdownScreen extends StatefulWidget {
  const _SosCountdownScreen({required this.duration});

  final Duration duration;

  @override
  State<_SosCountdownScreen> createState() => _SosCountdownScreenState();
}

class _SosCountdownScreenState extends State<_SosCountdownScreen> {
  static const Duration _tick = Duration(milliseconds: 100);

  late Duration _remaining = widget.duration;
  Timer? _timer;
  bool _resolved = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(_tick, (_) {
      final next = _remaining - _tick;
      if (next <= Duration.zero) {
        _finish(true);
        return;
      }
      setState(() => _remaining = next);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _finish(bool dispatch) {
    if (_resolved) {
      return;
    }
    _resolved = true;
    _timer?.cancel();
    Navigator.of(context).pop(dispatch);
  }

  @override
  Widget build(BuildContext context) {
    final fraction = 1 -
        (_remaining.inMilliseconds / widget.duration.inMilliseconds)
            .clamp(0.0, 1.0);
    final secondsLeft =
        (_remaining.inMilliseconds / 1000).ceil().clamp(1, 99);

    return PopScope(
      // No back-gesture, no back-button dismissal - the only way out of this
      // screen is the slide-to-cancel control below, or letting it run out.
      canPop: false,
      child: Scaffold(
        backgroundColor: const Color(0xFF7A0E0E),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 28),
            child: Column(
              children: <Widget>[
                const Spacer(),
                const Icon(
                  Icons.warning_rounded,
                  color: Colors.white,
                  size: 60,
                ),
                const SizedBox(height: 18),
                const Text(
                  'Sending SOS',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Alerting the MDRRMO with your position.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70, fontSize: 14),
                ),
                const SizedBox(height: 32),
                SizedBox(
                  width: 130,
                  height: 130,
                  child: Stack(
                    alignment: Alignment.center,
                    children: <Widget>[
                      SizedBox(
                        width: 130,
                        height: 130,
                        child: CircularProgressIndicator(
                          value: fraction,
                          strokeWidth: 7,
                          backgroundColor: Colors.white24,
                          valueColor:
                              const AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      ),
                      Text(
                        '$secondsLeft',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 42,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
                const Spacer(),
                _SlideToAction(
                  label: 'Slide to cancel',
                  icon: Icons.close_rounded,
                  accentColor: Colors.white,
                  thumbIconColor: const Color(0xFF7A0E0E),
                  onConfirmed: () => _finish(false),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Do nothing and the SOS sends automatically.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white54, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Shown right after dispatch. Lets the fisher attach what's actually wrong
/// (updating the note already on file at the MDRRMO) or stand the alert
/// down if it went out by mistake - both remain available at once, they are
/// not mutually exclusive steps.
class _EmergencyDetailsSheet extends StatefulWidget {
  const _EmergencyDetailsSheet({
    required this.boat,
    required this.onSubmitNote,
    required this.onStandDown,
  });

  final String boat;
  final Future<void> Function(String note) onSubmitNote;
  final Future<void> Function() onStandDown;

  @override
  State<_EmergencyDetailsSheet> createState() =>
      _EmergencyDetailsSheetState();
}

class _EmergencyDetailsSheetState extends State<_EmergencyDetailsSheet> {
  _EmergencyType? _selected;
  final TextEditingController _custom = TextEditingController();
  bool _submitting = false;
  bool _standingDown = false;

  @override
  void dispose() {
    _custom.dispose();
    super.dispose();
  }

  String? get _noteToSend {
    final type = _selected;
    if (type == null) {
      return null;
    }
    if (type == _EmergencyType.other) {
      final text = _custom.text.trim();
      return text.isEmpty ? null : text;
    }
    return type.label;
  }

  Future<void> _submit() async {
    final note = _noteToSend;
    setState(() => _submitting = true);
    if (note != null) {
      await widget.onSubmitNote(note);
    }
    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  Future<void> _standDown() async {
    setState(() => _standingDown = true);
    await widget.onStandDown();
    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? _canvasDark : Colors.white;
    final fg = isDark ? Colors.white : const Color(0xFF0F172A);
    final dim = isDark ? Colors.white60 : const Color(0xFF64748B);

    return PopScope(
      // Closing this sheet is only ever a deliberate choice - "send update",
      // "stand down", or explicitly dismissing without either - never an
      // accidental back-swipe, since the alarm is still ringing underneath
      // it and a stray dismissal must not leave the fisher unsure whether
      // anything was recorded.
      canPop: false,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(24),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: dim.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Row(
                children: <Widget>[
                  const Icon(Icons.check_circle_rounded,
                      color: _success, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'SOS sent for ${widget.boat}',
                      style: TextStyle(
                        color: fg,
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                "What's wrong? This updates what the MDRRMO sees - optional, "
                'the alert has already gone out.',
                style: TextStyle(color: dim, fontSize: 12.5, height: 1.35),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: <Widget>[
                  for (final type in _EmergencyType.values)
                    ChoiceChip(
                      label: Text(type.label),
                      avatar: Icon(type.icon, size: 16),
                      selected: _selected == type,
                      onSelected: _submitting || _standingDown
                          ? null
                          : (value) =>
                              setState(() => _selected = value ? type : null),
                    ),
                ],
              ),
              if (_selected == _EmergencyType.other) ...<Widget>[
                const SizedBox(height: 10),
                TextField(
                  controller: _custom,
                  maxLength: AqOneConfig.maxNoteLength,
                  textCapitalization: TextCapitalization.sentences,
                  enabled: !_submitting && !_standingDown,
                  decoration: const InputDecoration(
                    hintText: 'Describe what is wrong',
                    counterText: '',
                    isDense: true,
                  ),
                ),
              ],
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: (_submitting || _standingDown) ? null : _submit,
                  style: FilledButton.styleFrom(
                    backgroundColor: _brandPrimary,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(
                    _selected == null ? 'Close' : 'Send update',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Divider(color: dim.withValues(alpha: 0.25)),
              const SizedBox(height: 8),
              Text(
                'Sent by mistake?',
                style: TextStyle(
                  color: fg,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 8),
              _SlideToAction(
                label: _standingDown ? 'Standing down…' : 'Slide to stand down',
                icon: Icons.undo_rounded,
                accentColor: _danger,
                onConfirmed: _submitting || _standingDown ? null : _standDown,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A large, deliberate "slide to confirm" control - used both to cancel the
/// countdown and to stand down an already-sent SOS. A tap can happen by
/// accident; dragging a thumb the width of a track cannot, which is exactly
/// the asymmetry wanted for actions this consequential.
class _SlideToAction extends StatefulWidget {
  const _SlideToAction({
    required this.label,
    required this.icon,
    required this.accentColor,
    required this.onConfirmed,
    this.thumbIconColor = Colors.white,
  });

  final String label;
  final IconData icon;
  final Color accentColor;
  final Color thumbIconColor;

  /// Null disables the control (shown mid-action, e.g. while a stand-down
  /// request is already in flight).
  final VoidCallback? onConfirmed;

  @override
  State<_SlideToAction> createState() => _SlideToActionState();
}

class _SlideToActionState extends State<_SlideToAction> {
  static const double _thumbSize = 48;

  double _fraction = 0;
  bool _dragging = false;
  bool _confirmed = false;

  void _onDragUpdate(DragUpdateDetails details, double maxDrag) {
    if (_confirmed || widget.onConfirmed == null || maxDrag <= 0) {
      return;
    }
    setState(() {
      _dragging = true;
      _fraction =
          (_fraction * maxDrag + details.delta.dx).clamp(0, maxDrag) /
              maxDrag;
    });
  }

  void _onDragEnd(DragEndDetails details) {
    if (_confirmed || widget.onConfirmed == null) {
      return;
    }
    if (_fraction > 0.8) {
      setState(() {
        _confirmed = true;
        _fraction = 1;
        _dragging = false;
      });
      widget.onConfirmed!();
    } else {
      setState(() {
        _dragging = false;
        _fraction = 0;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onConfirmed != null;
    final accent = enabled ? widget.accentColor : Colors.grey;
    return LayoutBuilder(
      builder: (context, constraints) {
        final trackWidth = constraints.maxWidth;
        final maxDrag = (trackWidth - _thumbSize).clamp(0, trackWidth);
        final thumbLeft = _fraction * maxDrag;
        return Container(
          height: _thumbSize + 8,
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular((_thumbSize + 8) / 2),
            border: Border.all(color: accent.withValues(alpha: 0.45)),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: <Widget>[
              Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: _thumbSize),
                  child: Text(
                    widget.label,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: accent,
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
              AnimatedPositioned(
                duration: _dragging
                    ? Duration.zero
                    : const Duration(milliseconds: 220),
                curve: Curves.easeOut,
                left: thumbLeft,
                child: GestureDetector(
                  onHorizontalDragUpdate: (d) =>
                      _onDragUpdate(d, maxDrag.toDouble()),
                  onHorizontalDragEnd: _onDragEnd,
                  child: Container(
                    width: _thumbSize,
                    height: _thumbSize,
                    decoration: BoxDecoration(
                      color: accent,
                      shape: BoxShape.circle,
                      boxShadow: const <BoxShadow>[
                        BoxShadow(color: Colors.black26, blurRadius: 6),
                      ],
                    ),
                    child: Icon(
                      widget.icon,
                      color: widget.thumbIconColor,
                      size: 22,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Bottom sheet for recording a catch.
///
/// Never gates on connectivity - [CatchService.logCatch] saves locally first
/// and uploads whenever the phone next has signal, so this can be filled in
/// and closed even mid-trip with no bars.
/// Two taps in the common case: species chip, then a weight preset chip.
///
/// Deliberately not a form. A form is filled out; this is tapped through.
/// No exact weight is ever asked for here - see [CatchRecord]'s doc comment
/// for why a preset guess, confirmed later, beats typing a number at the
/// moment of catching. Method/notes exist but stay behind an explicit
/// toggle, off the fast path, because most catches need neither.
class _CatchLogSheet extends StatefulWidget {
  const _CatchLogSheet({required this.catches});

  final CatchService catches;

  @override
  State<_CatchLogSheet> createState() => _CatchLogSheetState();
}

class _CatchLogSheetState extends State<_CatchLogSheet> {
  static const List<String> _species = <String>[
    'Bangus',
    'Galunggong',
    'Tulingan',
    'Hasa-hasa',
    'Bisugo',
  ];
  static const String _other = 'Other';

  /// Common small-catch weights for municipal fishing. "Custom" covers
  /// anything else without blocking on it being in this list.
  static const List<double> _weightPresets = <double>[0.5, 1, 2, 5, 10];

  final TextEditingController _otherSpecies = TextEditingController();
  final TextEditingController _customWeight = TextEditingController();
  final TextEditingController _method = TextEditingController();
  final TextEditingController _notes = TextEditingController();

  String? _selectedSpecies;
  bool _enteringCustomWeight = false;
  bool _detailsOpen = false;
  bool _saving = false;
  String? _speciesError;
  String? _weightError;

  @override
  void dispose() {
    _otherSpecies.dispose();
    _customWeight.dispose();
    _method.dispose();
    _notes.dispose();
    super.dispose();
  }

  void _selectSpecies(String name) {
    setState(() {
      _selectedSpecies = name;
      _speciesError = null;
    });
  }

  Future<void> _selectWeight(double kg) async {
    if (_selectedSpecies == null) {
      setState(() => _speciesError = 'Pick a species first');
      return;
    }
    if (_selectedSpecies == _other && _otherSpecies.text.trim().isEmpty) {
      setState(() => _speciesError = 'Name the species, or pick one above');
      return;
    }
    await _save(kg);
  }

  void _submitCustomWeight() {
    final parsed = double.tryParse(_customWeight.text.trim());
    if (parsed == null || parsed <= 0 || !parsed.isFinite || parsed > 100000) {
      setState(() => _weightError = 'Enter a weight in kg');
      return;
    }
    _selectWeight(parsed);
  }

  Future<void> _save(double estimatedKg) async {
    if (_saving) {
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.catches.logCatch(
        // "Other" with a typed name keeps the species instead of discarding
        // it.
        speciesName: _selectedSpecies == _other
            ? _otherSpecies.text.trim()
            : _selectedSpecies,
        estimatedQuantityKg: estimatedKg,
        method: _method.text,
        notes: _notes.text,
      );
      if (mounted) {
        Navigator.pop(context, true);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not save this catch.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? _canvasDark : Colors.white;
    final fg = isDark ? Colors.white : const Color(0xFF0F172A);
    final dim = isDark ? Colors.white60 : const Color(0xFF64748B);
    final fieldFill = isDark ? _surfaceDark : Colors.white;
    final accent = const Color(0xFF0284C7);
    final inset = MediaQuery.of(context).viewInsets.bottom;

    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(
        color: isDark ? Colors.white24 : const Color(0xFFCBD5E1),
      ),
    );

    InputDecoration decoration(String label) => InputDecoration(
          labelText: label,
          labelStyle: TextStyle(color: dim),
          border: border,
          enabledBorder: border,
          filled: true,
          fillColor: fieldFill,
        );

    return Padding(
      padding: EdgeInsets.only(bottom: inset),
      child: Container(
        decoration: BoxDecoration(
          color: bg,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: dim.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Log a catch',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: fg,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Tap a species, then a rough weight. Reweigh and confirm the '
                'exact figure later from Catch history.',
                style: TextStyle(fontSize: 12, color: dim, height: 1.3),
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: <Widget>[
                  for (final name in <String>[..._species, _other])
                    ChoiceChip(
                      label: Text(name),
                      selected: _selectedSpecies == name,
                      onSelected: _saving ? null : (_) => _selectSpecies(name),
                    ),
                ],
              ),
              if (_speciesError != null) ...<Widget>[
                const SizedBox(height: 6),
                Text(
                  _speciesError!,
                  style: const TextStyle(fontSize: 11.5, color: Colors.redAccent),
                ),
              ],
              if (_selectedSpecies == _other) ...<Widget>[
                const SizedBox(height: 12),
                TextField(
                  controller: _otherSpecies,
                  textCapitalization: TextCapitalization.words,
                  style: TextStyle(color: fg),
                  enabled: !_saving,
                  decoration: decoration('Species name'),
                ),
              ],
              const SizedBox(height: 18),
              Text(
                'Tap a weight to log the catch',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: fg,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: <Widget>[
                  for (final kg in _weightPresets)
                    ActionChip(
                      label: Text(kg == kg.roundToDouble()
                          ? '${kg.toInt()} kg'
                          : '$kg kg'),
                      backgroundColor: accent.withValues(alpha: 0.12),
                      labelStyle: TextStyle(
                        color: accent,
                        fontWeight: FontWeight.w700,
                      ),
                      onPressed: _saving ? null : () => _selectWeight(kg),
                    ),
                  ActionChip(
                    label: Text(_enteringCustomWeight ? 'Custom…' : 'Custom'),
                    onPressed: _saving
                        ? null
                        : () => setState(
                              () => _enteringCustomWeight = true,
                            ),
                  ),
                ],
              ),
              if (_enteringCustomWeight) ...<Widget>[
                const SizedBox(height: 12),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: TextField(
                        controller: _customWeight,
                        autofocus: true,
                        enabled: !_saving,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        style: TextStyle(color: fg),
                        decoration: decoration('Weight (kg)'),
                        onSubmitted: (_) => _submitCustomWeight(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: _saving ? null : _submitCustomWeight,
                      style: FilledButton.styleFrom(backgroundColor: accent),
                      child: const Text('Log'),
                    ),
                  ],
                ),
                if (_weightError != null) ...<Widget>[
                  const SizedBox(height: 4),
                  Text(
                    _weightError!,
                    style: const TextStyle(fontSize: 11.5, color: Colors.redAccent),
                  ),
                ],
              ],
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: () => setState(() => _detailsOpen = !_detailsOpen),
                icon: Icon(
                  _detailsOpen ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                  size: 18,
                ),
                label: Text(
                  _detailsOpen ? 'Hide method/notes' : 'Add method or notes',
                  style: const TextStyle(fontSize: 12.5),
                ),
              ),
              if (_detailsOpen) ...<Widget>[
                TextField(
                  controller: _method,
                  enabled: !_saving,
                  style: TextStyle(color: fg),
                  decoration: decoration('Method (optional)'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _notes,
                  maxLines: 2,
                  maxLength: AqOneConfig.maxCatchNoteLength,
                  enabled: !_saving,
                  style: TextStyle(color: fg),
                  decoration: decoration('Notes (optional)'),
                ),
              ],
              if (_saving) ...<Widget>[
                const SizedBox(height: 8),
                const Center(
                  child: SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

