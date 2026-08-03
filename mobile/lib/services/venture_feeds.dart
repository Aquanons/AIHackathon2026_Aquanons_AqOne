import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config.dart';
import '../models/advisory.dart';
import '../models/buoy_marker.dart';
import '../models/fish_spot.dart';
import '../models/hazard_alert.dart';
import '../models/sea_condition.dart';
import '../models/weather_snapshot.dart';
import 'backend_client.dart';

/// Read-only feeds behind the Venture map.
///
/// Every method returns null on failure rather than throwing. These are
/// polled every 30 seconds, and a dropped poll should quietly leave the last
/// good data on screen rather than clearing the map or interrupting the user.
class VentureFeeds {
  VentureFeeds({
    required BackendClient backend,
    http.Client? weatherClient,
  })  : _backend = backend,
        _weatherClient = weatherClient ?? http.Client();

  final BackendClient _backend;
  final http.Client _weatherClient;

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

  Future<List<FishSpot>?> spots() async {
    final decoded = await _backend.getJson(AqOneConfig.spotsPath);
    if (decoded == null) {
      return null;
    }
    return FishSpot.parseList(decoded);
  }

  Future<List<BuoyMarker>?> buoys() async {
    final decoded = await _backend.getJson(AqOneConfig.buoysPath);
    if (decoded == null) {
      return null;
    }
    return BuoyMarker.parseList(decoded);
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
