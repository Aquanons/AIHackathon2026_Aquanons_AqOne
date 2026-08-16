import 'package:aqone/l10n/app_localizations.dart';
import 'package:flutter/material.dart';

import 'weather_snapshot.dart';

/// How dangerous a day looks for going out.
///
/// Carries an icon alongside the colour. The state must never be conveyed by
/// colour alone: this is read on a phone in direct glare on open water, and
/// colour vision deficiency affects roughly one man in twelve.
///
/// Display text lives in [RiskLevelL10n], not on the enum - const enum fields
/// cannot see a BuildContext. Same pattern as [SeaStatus]; see §4.1 of
/// `docs/22_LOCALIZATION_PLAN.md`.
enum RiskLevel {
  safe('safe', Color(0xFF16A34A), Icons.check_circle_rounded),
  caution('caution', Color(0xFFD97706), Icons.warning_amber_rounded),
  danger('danger', Color(0xFFDC2626), Icons.dangerous_rounded),
  unknown('unknown', Color(0xFF6B7280), Icons.help_outline_rounded);

  const RiskLevel(this.wire, this.color, this.icon);

  final String wire;
  final Color color;
  final IconData icon;

  static RiskLevel fromWire(String? value) {
    for (final RiskLevel level in RiskLevel.values) {
      if (level.wire == value) {
        return level;
      }
    }
    return RiskLevel.unknown;
  }
}

extension RiskLevelL10n on RiskLevel {
  /// Label under each day chip. Safety critical: "Safe" here means the
  /// forecast shows nothing adverse, never that the MDRRMO has cleared anyone
  /// to sail. See the review rules in `lib/l10n/README.md`.
  String label(AppLocalizations t) => switch (this) {
        RiskLevel.safe => t.riskLevelSafe,
        RiskLevel.caution => t.riskLevelCaution,
        RiskLevel.danger => t.riskLevelDanger,
        RiskLevel.unknown => t.riskLevelUnknown,
      };
}

/// Where a risk verdict was worked out.
enum RiskSource {
  /// Scored by the backend from buoy telemetry fused with a weather provider.
  /// The one we actually want.
  backend,

  /// Worked out on the handset from public forecast data because the backend
  /// did not supply a verdict. Weaker, and labelled as such in the UI.
  device,
}

/// A verdict plus enough provenance to say honestly how much it knew.
class RiskAssessment {
  const RiskAssessment({
    required this.level,
    required this.source,
    this.score,
    this.reason,
    this.inputs = const <String>[],
  });

  static const RiskAssessment unknown = RiskAssessment(
    level: RiskLevel.unknown,
    source: RiskSource.device,
    reason: 'No forecast data',
  );

  final RiskLevel level;
  final RiskSource source;

  /// 0-1 where 1 is most dangerous. Present for tuning and for a future
  /// gradient; the UI buckets on [level], not on this.
  final double? score;

  /// Short human explanation, e.g. "Gusts 41 km/h, 2.1 m swell".
  final String? reason;

  /// Which feeds fed the verdict, e.g. ['buoy:buoy-b', 'open-meteo'].
  final List<String> inputs;

  /// True when sea state was not among the inputs.
  ///
  /// Wind capsizes far fewer small bancas than a two-metre swell does, so a
  /// verdict reached without wave data is materially less trustworthy. The
  /// card says so rather than downgrading the level - crying wolf on every
  /// wave-less day would teach people to ignore amber.
  bool get missingSeaState => !inputs.any(
        (String i) => i.startsWith('buoy:') || i == 'wave',
      );
}

/// One day of the outlook.
///
/// Deliberately provider-agnostic: [weatherCode] is a WMO code because both
/// Open-Meteo and the AqOne backend speak it, which keeps a single icon
/// mapping working across providers.
class DailyOutlook {
  const DailyOutlook({
    required this.date,
    required this.weatherCode,
    required this.risk,
    this.tempMax,
    this.tempMin,
    this.windKph,
    this.gustKph,
    this.precipMm,
    this.waveM,
  });

  final DateTime date;
  final int weatherCode;
  final RiskAssessment risk;
  final double? tempMax;
  final double? tempMin;
  final double? windKph;
  final double? gustKph;
  final double? precipMm;

  /// Significant wave height in metres. Null means unknown, and must never be
  /// collapsed to 0.0 - a missing reading silently becoming "flat calm" is
  /// exactly how a dangerous day ends up green.
  final double? waveM;

  WeatherCondition get condition => WeatherCondition.fromCode(weatherCode);

  bool get isToday {
    final DateTime now = DateTime.now();
    return date.year == now.year &&
        date.month == now.month &&
        date.day == now.day;
  }

  /// Two-letter-ish weekday for the chip. 'Today' is handled by the widget.
  String get shortWeekday {
    const List<String> names = <String>[
      'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
    ];
    return names[(date.weekday - 1).clamp(0, 6)];
  }

  DailyOutlook copyWith({RiskAssessment? risk, double? waveM}) {
    return DailyOutlook(
      date: date,
      weatherCode: weatherCode,
      risk: risk ?? this.risk,
      tempMax: tempMax,
      tempMin: tempMin,
      windKph: windKph,
      gustKph: gustKph,
      precipMm: precipMm,
      waveM: waveM ?? this.waveM,
    );
  }

  // --- Parsing -------------------------------------------------------------

  /// Parses the AqOne fused-forecast contract:
  ///
  /// ```json
  /// {
  ///   "source": "aqone-fusion",
  ///   "generated_at": "2026-08-16T04:00:00Z",
  ///   "days": [{
  ///     "date": "2026-08-16",
  ///     "weather_code": 95,
  ///     "temp_max": 31.2, "temp_min": 25.8,
  ///     "wind_kph": 24, "gust_kph": 41,
  ///     "precip_mm": 18.4,
  ///     "wave_m": 2.1,
  ///     "risk": {
  ///       "level": "danger", "score": 0.81,
  ///       "reason": "Gusts 41 km/h, 2.1 m swell at Buoy B",
  ///       "inputs": ["buoy:buoy-b", "open-meteo"]
  ///     }
  ///   }]
  /// }
  /// ```
  ///
  /// `risk` is optional. When the backend omits it the day comes back with
  /// [RiskAssessment.unknown] and the caller is expected to fill it from the
  /// device heuristic - that is what lets the fused scorer be switched on
  /// server-side without shipping a new build.
  static List<DailyOutlook>? parseAqOneList(Object? payload) {
    if (payload is! Map) {
      return null;
    }
    final Object? days = payload['days'];
    if (days is! List) {
      return null;
    }
    final List<DailyOutlook> parsed = <DailyOutlook>[];
    for (final Object? entry in days) {
      final DailyOutlook? day = _fromAqOne(entry);
      if (day != null) {
        parsed.add(day);
      }
    }
    return parsed.isEmpty ? null : parsed;
  }

  static DailyOutlook? _fromAqOne(Object? entry) {
    if (entry is! Map) {
      return null;
    }
    final DateTime? date = _date(entry['date']);
    if (date == null) {
      return null;
    }
    return DailyOutlook(
      date: date,
      weatherCode: _int(entry['weather_code']) ?? 0,
      tempMax: _double(entry['temp_max']),
      tempMin: _double(entry['temp_min']),
      windKph: _double(entry['wind_kph']),
      gustKph: _double(entry['gust_kph']),
      precipMm: _double(entry['precip_mm']),
      waveM: _double(entry['wave_m']),
      risk: _risk(entry['risk']),
    );
  }

  static RiskAssessment _risk(Object? raw) {
    if (raw is! Map) {
      return RiskAssessment.unknown;
    }
    final RiskLevel level = RiskLevel.fromWire(raw['level'] as String?);
    if (level == RiskLevel.unknown) {
      return RiskAssessment.unknown;
    }
    final Object? inputs = raw['inputs'];
    return RiskAssessment(
      level: level,
      source: RiskSource.backend,
      score: _double(raw['score']),
      reason: raw['reason'] is String ? raw['reason'] as String : null,
      inputs: inputs is List
          ? inputs.whereType<String>().toList(growable: false)
          : const <String>[],
    );
  }

  /// Parses Open-Meteo's `daily` block. Risk is left [RiskAssessment.unknown]
  /// for the caller to score, since Open-Meteo has no opinion about whether a
  /// banca should put to sea.
  static List<DailyOutlook>? parseOpenMeteoList(Object? payload) {
    if (payload is! Map) {
      return null;
    }
    final Object? daily = payload['daily'];
    if (daily is! Map) {
      return null;
    }
    final Object? times = daily['time'];
    if (times is! List || times.isEmpty) {
      return null;
    }

    final List<DailyOutlook> parsed = <DailyOutlook>[];
    for (int i = 0; i < times.length; i++) {
      final DateTime? date = _date(times[i]);
      if (date == null) {
        continue;
      }
      parsed.add(
        DailyOutlook(
          date: date,
          weatherCode: _int(_at(daily['weather_code'], i)) ?? 0,
          tempMax: _double(_at(daily['temperature_2m_max'], i)),
          tempMin: _double(_at(daily['temperature_2m_min'], i)),
          windKph: _double(_at(daily['wind_speed_10m_max'], i)),
          gustKph: _double(_at(daily['wind_gusts_10m_max'], i)),
          precipMm: _double(_at(daily['precipitation_sum'], i)),
          risk: RiskAssessment.unknown,
        ),
      );
    }
    return parsed.isEmpty ? null : parsed;
  }

  /// Pulls daily maximum significant wave height out of an Open-Meteo marine
  /// response, keyed by date so a partial or misaligned series cannot shift
  /// Thursday's swell onto Tuesday's chip.
  static Map<DateTime, double> parseMarineDailyMax(Object? payload) {
    final Map<DateTime, double> byDay = <DateTime, double>{};
    if (payload is! Map) {
      return byDay;
    }
    final Object? hourly = payload['hourly'];
    if (hourly is! Map) {
      return byDay;
    }
    final Object? times = hourly['time'];
    final Object? heights = hourly['wave_height'];
    if (times is! List || heights is! List) {
      return byDay;
    }
    for (int i = 0; i < times.length && i < heights.length; i++) {
      final DateTime? at = _date(times[i]);
      final double? height = _double(heights[i]);
      // Nulls are frequent in nearshore cells the wave model does not cover.
      // Skipping them leaves waveM null, which the UI reports honestly.
      if (at == null || height == null) {
        continue;
      }
      final DateTime day = DateTime(at.year, at.month, at.day);
      final double? existing = byDay[day];
      if (existing == null || height > existing) {
        byDay[day] = height;
      }
    }
    return byDay;
  }

  // --- Serialisation, for the offline cache --------------------------------

  Map<String, Object?> toCacheJson() {
    return <String, Object?>{
      'date': date.toIso8601String(),
      'weather_code': weatherCode,
      'temp_max': tempMax,
      'temp_min': tempMin,
      'wind_kph': windKph,
      'gust_kph': gustKph,
      'precip_mm': precipMm,
      'wave_m': waveM,
      'risk': <String, Object?>{
        'level': risk.level.wire,
        'score': risk.score,
        'reason': risk.reason,
        'inputs': risk.inputs,
        'source': risk.source == RiskSource.backend ? 'backend' : 'device',
      },
    };
  }

  static DailyOutlook? fromCacheJson(Object? entry) {
    if (entry is! Map) {
      return null;
    }
    final DateTime? date = _date(entry['date']);
    if (date == null) {
      return null;
    }
    final Object? rawRisk = entry['risk'];
    RiskAssessment risk = RiskAssessment.unknown;
    if (rawRisk is Map) {
      final Object? inputs = rawRisk['inputs'];
      risk = RiskAssessment(
        level: RiskLevel.fromWire(rawRisk['level'] as String?),
        source: rawRisk['source'] == 'backend'
            ? RiskSource.backend
            : RiskSource.device,
        score: _double(rawRisk['score']),
        reason: rawRisk['reason'] is String ? rawRisk['reason'] as String : null,
        inputs: inputs is List
            ? inputs.whereType<String>().toList(growable: false)
            : const <String>[],
      );
    }
    return DailyOutlook(
      date: date,
      weatherCode: _int(entry['weather_code']) ?? 0,
      tempMax: _double(entry['temp_max']),
      tempMin: _double(entry['temp_min']),
      windKph: _double(entry['wind_kph']),
      gustKph: _double(entry['gust_kph']),
      precipMm: _double(entry['precip_mm']),
      waveM: _double(entry['wave_m']),
      risk: risk,
    );
  }

  // --- Helpers -------------------------------------------------------------

  static Object? _at(Object? list, int index) {
    if (list is List && index < list.length) {
      return list[index];
    }
    return null;
  }

  static double? _double(Object? value) {
    if (value is num) {
      final double d = value.toDouble();
      return d.isFinite ? d : null;
    }
    return null;
  }

  static int? _int(Object? value) => value is num ? value.toInt() : null;

  static DateTime? _date(Object? value) {
    if (value is! String) {
      return null;
    }
    return DateTime.tryParse(value);
  }
}
