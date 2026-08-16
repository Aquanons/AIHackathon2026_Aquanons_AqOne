import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config.dart';
import '../models/advisory.dart';
import '../models/buoy_marker.dart';
import '../models/community_spot.dart';
import '../models/daily_outlook.dart';
import '../models/hazard_alert.dart';
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
  })  : _backend = backend,
        _weatherClient = weatherClient ?? http.Client(),
        _forecast = forecastProvider ??
            AqOneForecastProvider(
              backend: backend,
              fallback: OpenMeteoForecastProvider(client: weatherClient),
            );

  final BackendClient _backend;
  final http.Client _weatherClient;
  final ForecastProvider _forecast;

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
    final decoded = await _backend.getJson(AqOneConfig.buoysPath);
    if (decoded == null) {
      return null;
    }
    return BuoyMarker.parseList(decoded);
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
    final decoded = await _backend.getJson(path);
    if (decoded == null) {
      return null;
    }
    return HazardAlert.parseList(decoded, kind);
  }

  /// The MDRRMO-set sea condition. Falls back to the public endpoint so the
  /// banner still populates if the authenticated one is unavailable.
  Future<SeaCondition?> seaCondition() async {
    final decoded = await _backend.getJson(AqOneConfig.seaConditionPath) ??
        await _backend.getJson(AqOneConfig.publicSeaConditionPath);
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
    final decoded = await _backend.getJson(AqOneConfig.advisoriesPath) ??
        await _backend.getJson(AqOneConfig.publicAdvisoriesPath);
    if (decoded == null) {
      return null;
    }
    return Advisory.parseList(decoded);
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
