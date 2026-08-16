import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config.dart';
import '../models/daily_outlook.dart';
import 'backend_client.dart';
import 'safety_score.dart';

/// Where the daily outlook comes from.
///
/// Exists so the provider can be swapped without the UI knowing. Three are
/// planned:
///
///  * [OpenMeteoForecastProvider] - now. Free, keyless, global.
///  * A PAGASA provider - once a data-sharing agreement exists. Note their
///    TenDay API is keyed by municipality rather than coordinates and carries
///    no sea state, which is why [municipality] is on this interface from the
///    start and why waves keep coming from the marine model either way.
///  * [AqOneForecastProvider] - the real target. Backend fuses buoy sensor
///    telemetry with a weather provider and scores the risk server-side.
abstract class ForecastProvider {
  /// Returns null on any failure. Callers keep showing the last good data
  /// rather than clearing the strip - a dropped poll at sea is normal.
  Future<List<DailyOutlook>?> daily({
    required double lat,
    required double lon,
    String? municipality,
    int days,
  });
}

/// Open-Meteo: atmospheric forecast plus a second call to the marine model
/// for wave height.
///
/// The two are separate hosts and the marine one frequently has no data for
/// nearshore cells, so a failed or empty wave response degrades to a forecast
/// with `waveM == null` rather than failing the whole fetch. That null is
/// load-bearing: it is what makes the UI admit sea state was not considered.
class OpenMeteoForecastProvider implements ForecastProvider {
  OpenMeteoForecastProvider({http.Client? client})
      : _client = client ?? http.Client();

  final http.Client _client;

  @override
  Future<List<DailyOutlook>?> daily({
    required double lat,
    required double lon,
    String? municipality,
    int days = AqOneConfig.forecastDays,
  }) async {
    final List<DailyOutlook>? outlook = await _atmospheric(lat, lon, days);
    if (outlook == null) {
      return null;
    }

    final Map<DateTime, double> waves = await _waves(days);

    return outlook
        .map((DailyOutlook day) {
          final DateTime key =
              DateTime(day.date.year, day.date.month, day.date.day);
          final double? wave = waves[key];
          return SafetyScore.applyTo(
            wave == null ? day : day.copyWith(waveM: wave),
          );
        })
        .toList(growable: false);
  }

  Future<List<DailyOutlook>?> _atmospheric(
    double lat,
    double lon,
    int days,
  ) async {
    try {
      final Uri uri = Uri.parse(
        '${AqOneConfig.openMeteoBase}'
        '?latitude=$lat&longitude=$lon'
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,'
        'wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum'
        '&forecast_days=$days&timezone=auto',
      );
      final http.Response response =
          await _client.get(uri).timeout(AqOneConfig.backendTimeout);
      if (response.statusCode != 200) {
        return null;
      }
      return DailyOutlook.parseOpenMeteoList(jsonDecode(response.body));
    } catch (_) {
      return null;
    }
  }

  /// Wave heights are sampled at a fixed offshore point rather than at the
  /// municipal centre: the marine grid only covers water, and asking it about
  /// a point on Panay returns nothing at all.
  Future<Map<DateTime, double>> _waves(int days) async {
    try {
      final Uri uri = Uri.parse(
        '${AqOneConfig.openMeteoMarineBase}'
        '?latitude=${AqOneConfig.marineSampleLat}'
        '&longitude=${AqOneConfig.marineSampleLon}'
        '&hourly=wave_height&forecast_days=$days&timezone=auto',
      );
      final http.Response response =
          await _client.get(uri).timeout(AqOneConfig.backendTimeout);
      if (response.statusCode != 200) {
        return const <DateTime, double>{};
      }
      return DailyOutlook.parseMarineDailyMax(jsonDecode(response.body));
    } catch (_) {
      return const <DateTime, double>{};
    }
  }

  void close() => _client.close();
}

/// Tries the AqOne fused endpoint first, falls back to [fallback].
///
/// This is the seam that lets the buoy-fusion scorer be switched on
/// server-side with no handset release: the moment /api/public/forecast starts
/// answering, every phone in the water picks it up on its next refresh.
///
/// Days that come back without a `risk` block are scored on-device, so a
/// backend that can serve weather but not yet a verdict is still an upgrade
/// rather than a regression.
class AqOneForecastProvider implements ForecastProvider {
  AqOneForecastProvider({
    required BackendClient backend,
    required ForecastProvider fallback,
  })  : _backend = backend,
        _fallback = fallback;

  final BackendClient _backend;
  final ForecastProvider _fallback;

  @override
  Future<List<DailyOutlook>?> daily({
    required double lat,
    required double lon,
    String? municipality,
    int days = AqOneConfig.forecastDays,
  }) async {
    final Object? decoded = await _backend.getJson(
      '${AqOneConfig.publicForecastPath}?lat=$lat&lon=$lon&days=$days',
    );
    final List<DailyOutlook>? fused = DailyOutlook.parseAqOneList(decoded);
    if (fused != null && fused.isNotEmpty) {
      return fused.map(SafetyScore.applyTo).toList(growable: false);
    }
    return _fallback.daily(
      lat: lat,
      lon: lon,
      municipality: municipality,
      days: days,
    );
  }
}
