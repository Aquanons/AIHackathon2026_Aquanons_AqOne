import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config.dart';
import '../data/map_snapshot_store.dart';
import '../data/welcome_advisory.dart';
import '../models/advisory.dart';
import '../models/buoy_marker.dart';
import '../models/community_spot.dart';
import '../models/daily_outlook.dart';
import '../models/hazard_alert.dart';
import '../models/hotspot_cell.dart';
import '../models/sea_condition.dart';
import '../models/squall_watch.dart';
import '../models/weather_snapshot.dart';
import 'backend_client.dart';
import 'forecast_provider.dart';

/// Read-only feeds behind the Venture map.
///
/// Every method returns null on failure rather than throwing. These are
/// polled every 30 seconds, and a dropped poll should quietly leave the last
/// good data on screen rather than clearing the map or interrupting the user.
class VentureFeeds {
  VentureFeeds({
    required BackendClient backend,
    http.Client? weatherClient,
    ForecastProvider? forecastProvider,
    MapSnapshotStore? snapshots,
  })  : _backend = backend,
        _snapshots = snapshots,
        _weatherClient = weatherClient ?? http.Client(),
        _forecast = forecastProvider ??
            AqOneForecastProvider(
              backend: backend,
              fallback: OpenMeteoForecastProvider(client: weatherClient),
            );

  final BackendClient _backend;
  final http.Client _weatherClient;
  final ForecastProvider _forecast;

  /// Null in tests and anywhere a database is not worth standing up. Every
  /// feed then behaves exactly as it did before offline support existed.
  final MapSnapshotStore? _snapshots;

  /// Fetches [path], snapshotting the response so the same feed can be served
  /// with no signal.
  ///
  /// The snapshot holds the raw body, so a stored response parses through the
  /// identical model code as a live one. There is no second code path to keep
  /// correct, which matters for data a rescue may depend on.
  Future<Object?> _cachedJson(String feed, Future<Object?> Function() fetch) async {
    final Object? live = await fetch();
    final MapSnapshotStore? store = _snapshots;
    if (live != null) {
      if (store != null) {
        await store.save(feed, jsonEncode(live));
      }
      return live;
    }
    if (store == null) {
      return null;
    }
    final MapSnapshot? cached = await store.load(feed);
    if (cached == null) {
      return null;
    }
    try {
      return jsonDecode(cached.payload);
    } catch (_) {
      return null;
    }
  }

  /// When each feed was last successfully fetched, for the offline banner.
  Future<Map<String, DateTime>> snapshotAges() async =>
      _snapshots?.ages() ?? const <String, DateTime>{};

  /// Current conditions from Open-Meteo.
  Future<WeatherSnapshot?> weather({
    required double lat,
    required double lon,
  }) async {
    try {
      final uri = Uri.parse(
        '${AqOneConfig.openMeteoBase}'
        '?latitude=$lat&longitude=$lon&current_weather=true',
      );
      final response =
          await _weatherClient.get(uri).timeout(AqOneConfig.backendTimeout);
      if (response.statusCode != 200) {
        return null;
      }
      return WeatherSnapshot.tryParse(jsonDecode(response.body));
    } catch (_) {
      return null;
    }
  }

  /// Seven-day outlook with a per-day risk verdict.
  ///
  /// Delegates to the configured [ForecastProvider], which tries the fused
  /// AqOne endpoint before falling back to Open-Meteo. Null on failure, same
  /// contract as everything else here: keep the last good strip on screen.
  Future<List<DailyOutlook>?> forecast({
    required double lat,
    required double lon,
    String? municipality,
  }) {
    return _forecast.daily(
      lat: lat,
      lon: lon,
      municipality: municipality ?? AqOneConfig.defaultMunicipality,
      days: AqOneConfig.forecastDays,
    );
  }

  Future<List<BuoyMarker>?> buoys() async {
    final decoded = await _cachedJson(
      MapSnapshotStore.feedBuoys,
      () => _backend.getJson(AqOneConfig.buoysPath),
    );
    if (decoded == null) {
      return null;
    }
    return BuoyMarker.parseList(decoded);
  }

  /// The privacy-preserving recent catch-activity surface.
  ///
  /// There is no device-side substitute: this needs consented records from
  /// several vessels, and a handset only has its owner's local history.
  Future<HotspotSurface?> hotspots() async {
    final Object? decoded = await _cachedJson(
      MapSnapshotStore.feedHotspots,
      () => _backend.getJson(AqOneConfig.publicHotspotsPath),
    );
    if (decoded == null) {
      return null;
    }
    return HotspotCell.parse(decoded);
  }

  /// DEPRECATED, and no longer called from anywhere.
  ///
  /// Manual spot reporting was removed from Venture - see [AqOneConfig.spotsPath]
  /// for why. Kept only so the endpoint has a client-side reader if the
  /// dashboard ever wants one; delete it with the endpoint.
  @Deprecated('Manual fishing spots were removed; hotspots come from the model')
  Future<List<CommunitySpot>?> spots() async {
    final decoded = await _backend.getJson(AqOneConfig.spotsPath);
    if (decoded == null) {
      return null;
    }
    return CommunitySpot.parseList(decoded);
  }

  Future<List<HazardAlert>?> hazards(HazardKind kind) async {
    final path = kind == HazardKind.wave
        ? AqOneConfig.waveAlertsPath
        : AqOneConfig.capsizingAlertsPath;
    // Hazards expire far sooner than the other feeds - see
    // MapSnapshotStore.hazardMaxAge. A six-hour-old wave warning says
    // nothing about the sea a fisherman is looking at now.
    final decoded = await _cachedJson(
      kind == HazardKind.wave
          ? MapSnapshotStore.feedWaveAlerts
          : MapSnapshotStore.feedCapsizeAlerts,
      () => _backend.getJson(path),
    );
    if (decoded == null) {
      return null;
    }
    return HazardAlert.parseList(decoded, kind);
  }

  /// The MDRRMO-set sea condition. Falls back to the public endpoint so the
  /// banner still populates if the authenticated one is unavailable.
  Future<SeaCondition?> seaCondition() async {
    final decoded = await _cachedJson(
      MapSnapshotStore.feedSeaCondition,
      () async =>
          await _backend.getJson(AqOneConfig.seaConditionPath) ??
          await _backend.getJson(AqOneConfig.publicSeaConditionPath),
    );
    if (decoded == null) {
      return null;
    }
    return SeaCondition.tryParse(decoded);
  }

  /// Squall nowcast (AI #1).
  ///
  /// Returns `SquallWatch.unavailable` rather than null on failure, so the
  /// caller gets `SquallLevel.unknown` instead of something that could be
  /// mistaken for "no squall". A warning system that cannot reach its model
  /// must say so, not imply calm.
  Future<SquallWatch> squall() async {
    final decoded = await _backend.getJson(AqOneConfig.publicSquallPath);
    if (decoded == null) {
      return SquallWatch.unavailable;
    }
    return SquallWatch.tryParse(decoded) ?? SquallWatch.unavailable;
  }

  Future<List<Advisory>?> advisories() async {
    final decoded = await _cachedJson(
      MapSnapshotStore.feedAdvisories,
      () async =>
          await _backend.getJson(AqOneConfig.advisoriesPath) ??
          await _backend.getJson(AqOneConfig.publicAdvisoriesPath),
    );
    // null means the fetch failed (and no cached snapshot exists) - callers
    // must show that as "could not load", not as "no active advisories".
    // Turning an outage into an empty list-plus-welcome-note used to make
    // every failure look like a successful check with nothing to report.
    if (decoded == null) {
      return null;
    }
    // The welcome note is appended, never merged into the feed: it is ours,
    // not the MDRRMO's. parseList has already sorted by urgency, and
    // appending keeps it last so a real advisory is never pushed below it.
    return <Advisory>[
      ...Advisory.parseList(decoded),
      WelcomeAdvisory.instance,
    ];
  }

  void close() => _weatherClient.close();
}

/// Guards against a slow response overwriting a newer one.
///
/// Venture fires overlapping requests whenever the user moves or a poll
/// fires. Without this, a stale reply landing late can replace fresher data.
class RequestGuard {
  int _version = 0;

  int begin() => ++_version;

  bool isCurrent(int version) => version == _version;
}
