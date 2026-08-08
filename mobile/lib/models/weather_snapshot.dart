import 'package:flutter/material.dart';

import '../core/config.dart';

/// A current-conditions reading from Open-Meteo.
///
/// Weather does not come from the AqOne backend. It is a public third-party
/// reading and is treated as advisory only - the authoritative go/no-go signal
/// is the MDRRMO-set sea condition.
class WeatherSnapshot {
  const WeatherSnapshot({
    required this.temperature,
    required this.windSpeed,
    required this.weatherCode,
  });

  /// Degrees Celsius.
  final double temperature;

  /// Kilometres per hour.
  final double windSpeed;

  /// WMO weather interpretation code.
  final int weatherCode;

  static WeatherSnapshot? tryParse(Object? payload) {
    if (payload is! Map) {
      return null;
    }
    final current = payload['current_weather'];
    if (current is! Map) {
      return null;
    }
    final temperature = current['temperature'];
    final windSpeed = current['windspeed'];
    final weatherCode = current['weathercode'];
    if (temperature is! num || windSpeed is! num || weatherCode is! num) {
      return null;
    }
    final parsedTemperature = temperature.toDouble();
    final parsedWindSpeed = windSpeed.toDouble();
    if (!parsedTemperature.isFinite || !parsedWindSpeed.isFinite) {
      return null;
    }
    return WeatherSnapshot(
      temperature: parsedTemperature,
      windSpeed: parsedWindSpeed,
      weatherCode: weatherCode.toInt(),
    );
  }

  WeatherCondition get condition => WeatherCondition.fromCode(weatherCode);

  /// Client-side go/no-go heuristic.
  ///
  /// IMPORTANT: this is a crude threshold, not an authoritative decision. It
  /// ignores the official sea condition, buoy hazards, wave height and tide.
  /// Anything shown from this must be labelled as informational.
  ///
  /// Known gap carried over from the source implementation: fog and showers
  /// are treated as safe. That is almost certainly too permissive, but the
  /// rule is preserved verbatim so the change is a deliberate product
  /// decision rather than a silent one.
  bool get looksUnsafe {
    if (windSpeed > AqOneConfig.unsafeWindKph) {
      return true;
    }
    return condition == WeatherCondition.thunderstorm ||
        condition == WeatherCondition.rainy;
  }
}

enum WeatherCondition {
  sunny('Sunny & Clear', Icons.wb_sunny_rounded),
  partlyCloudy('Partly Cloudy', Icons.cloud_rounded),
  foggy('Foggy', Icons.foggy),
  rainy('Rainy', Icons.umbrella_rounded),
  showers('Showers', Icons.grain_rounded),
  thunderstorm('Thunderstorm', Icons.thunderstorm_rounded),
  calm('Sunny & Calm', Icons.wb_sunny_rounded);

  const WeatherCondition(this.label, this.icon);

  final String label;
  final IconData icon;

  /// WMO code mapping, matching the source project's buckets.
  static WeatherCondition fromCode(int code) {
    if (code == 0) {
      return WeatherCondition.sunny;
    }
    if (code >= 1 && code <= 3) {
      return WeatherCondition.partlyCloudy;
    }
    if (code == 45 || code == 48) {
      return WeatherCondition.foggy;
    }
    if (code >= 51 && code <= 67) {
      return WeatherCondition.rainy;
    }
    if (code >= 80 && code <= 82) {
      return WeatherCondition.showers;
    }
    if (code >= 95) {
      return WeatherCondition.thunderstorm;
    }
    return WeatherCondition.calm;
  }
}
