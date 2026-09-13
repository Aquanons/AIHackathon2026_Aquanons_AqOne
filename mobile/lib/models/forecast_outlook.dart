import 'daily_outlook.dart';
import 'weather_snapshot.dart';

/// An hourly forecast interval carrying atmospheric and marine predictions.
class HourlyInterval {
  const HourlyInterval({
    required this.time,
    this.weatherCode,
    this.tempC,
    this.windKph,
    this.gustKph,
    this.precipMm,
    this.waveM,
  });

  final DateTime time;
  final int? weatherCode;
  final double? tempC;
  final double? windKph;
  final double? gustKph;
  final double? precipMm;
  final double? waveM;

  WeatherCondition? get condition =>
      weatherCode != null ? WeatherCondition.fromCode(weatherCode!) : null;

  Map<String, Object?> toCacheJson() => <String, Object?>{
        'time': time.toIso8601String(),
        'weather_code': weatherCode,
        'temp_c': tempC,
        'wind_kph': windKph,
        'gust_kph': gustKph,
        'precip_mm': precipMm,
        'wave_m': waveM,
      };

  static HourlyInterval? fromCacheJson(Object? raw) {
    if (raw is! Map) return null;
    final timeStr = raw['time'];
    if (timeStr is! String) return null;
    final time = DateTime.tryParse(timeStr);
    if (time == null) return null;

    return HourlyInterval(
      time: time,
      weatherCode: _int(raw['weather_code']),
      tempC: _double(raw['temp_c']),
      windKph: _double(raw['wind_kph']),
      gustKph: _double(raw['gust_kph']),
      precipMm: _double(raw['precip_mm']),
      waveM: _double(raw['wave_m']),
    );
  }

  static double? _double(Object? value) {
    if (value is num) {
      final double d = value.toDouble();
      return d.isFinite ? d : null;
    }
    return null;
  }

  static int? _int(Object? value) => value is num ? value.toInt() : null;
}

/// The complete forecast dataset holding daily outlooks, hourly intervals,
/// retrieval time, and provenance metadata.
class ForecastOutlook {
  const ForecastOutlook({
    required this.days,
    required this.hours,
    required this.fetchedAt,
    this.generatedAt,
    this.latitude,
    this.longitude,
    this.timezone,
    this.timezoneAbbreviation,
    this.utcOffsetSeconds,
    this.source = 'backend',
    this.units = const <String, String>{},
    this.marineSampleLat,
    this.marineSampleLon,
  });

  final List<DailyOutlook> days;
  final List<HourlyInterval> hours;
  final DateTime fetchedAt;
  final DateTime? generatedAt;
  final double? latitude;
  final double? longitude;
  final String? timezone;
  final String? timezoneAbbreviation;
  final int? utcOffsetSeconds;
  final String source;
  final Map<String, String> units;
  final double? marineSampleLat;
  final double? marineSampleLon;

  bool get hasHourly => hours.isNotEmpty;

  ForecastOutlook copyWith({
    List<DailyOutlook>? days,
    List<HourlyInterval>? hours,
    DateTime? fetchedAt,
    DateTime? generatedAt,
    double? latitude,
    double? longitude,
    String? timezone,
    String? timezoneAbbreviation,
    int? utcOffsetSeconds,
    String? source,
    Map<String, String>? units,
    double? marineSampleLat,
    double? marineSampleLon,
  }) =>
      ForecastOutlook(
        days: days ?? this.days,
        hours: hours ?? this.hours,
        fetchedAt: fetchedAt ?? this.fetchedAt,
        generatedAt: generatedAt ?? this.generatedAt,
        latitude: latitude ?? this.latitude,
        longitude: longitude ?? this.longitude,
        timezone: timezone ?? this.timezone,
        timezoneAbbreviation:
            timezoneAbbreviation ?? this.timezoneAbbreviation,
        utcOffsetSeconds: utcOffsetSeconds ?? this.utcOffsetSeconds,
        source: source ?? this.source,
        units: units ?? this.units,
        marineSampleLat: marineSampleLat ?? this.marineSampleLat,
        marineSampleLon: marineSampleLon ?? this.marineSampleLon,
      );

  Map<String, Object?> toCacheJson() => <String, Object?>{
        'version': 2,
        'fetched_at': fetchedAt.toIso8601String(),
        'generated_at': generatedAt?.toIso8601String(),
        'latitude': latitude,
        'longitude': longitude,
        'timezone': timezone,
        'timezone_abbreviation': timezoneAbbreviation,
        'utc_offset_seconds': utcOffsetSeconds,
        'source': source,
        'units': units,
        'marine_sample_lat': marineSampleLat,
        'marine_sample_lon': marineSampleLon,
        'days': days.map((d) => d.toCacheJson()).toList(growable: false),
        'hours': hours.map((h) => h.toCacheJson()).toList(growable: false),
      };

  static ForecastOutlook? fromCacheJson(Object? raw) {
    if (raw is! Map) return null;
    final fetchedAtStr = raw['fetched_at'];
    if (fetchedAtStr is! String) return null;
    final fetchedAt = DateTime.tryParse(fetchedAtStr);
    if (fetchedAt == null) return null;

    final daysRaw = raw['days'];
    final List<DailyOutlook> days = <DailyOutlook>[];
    if (daysRaw is List) {
      for (final item in daysRaw) {
        final d = DailyOutlook.fromCacheJson(item);
        if (d != null) days.add(d);
      }
    }

    final hoursRaw = raw['hours'];
    final List<HourlyInterval> hours = <HourlyInterval>[];
    if (hoursRaw is List) {
      for (final item in hoursRaw) {
        final h = HourlyInterval.fromCacheJson(item);
        if (h != null) hours.add(h);
      }
    }

    final unitsRaw = raw['units'];
    final Map<String, String> units = <String, String>{};
    if (unitsRaw is Map) {
      for (final entry in unitsRaw.entries) {
        if (entry.key is String && entry.value is String) {
          units[entry.key as String] = entry.value as String;
        }
      }
    }

    final genStr = raw['generated_at'];

    return ForecastOutlook(
      days: days,
      hours: hours,
      fetchedAt: fetchedAt,
      generatedAt: genStr is String ? DateTime.tryParse(genStr) : null,
      latitude: _double(raw['latitude']),
      longitude: _double(raw['longitude']),
      timezone: raw['timezone'] is String ? raw['timezone'] as String : null,
      timezoneAbbreviation: raw['timezone_abbreviation'] is String
          ? raw['timezone_abbreviation'] as String
          : null,
      utcOffsetSeconds: _int(raw['utc_offset_seconds']),
      source: raw['source'] is String ? raw['source'] as String : 'cache',
      units: units,
      marineSampleLat: _double(raw['marine_sample_lat']),
      marineSampleLon: _double(raw['marine_sample_lon']),
    );
  }

  /// Parses the AqOne `/api/public/forecast` response payload.
  static ForecastOutlook? parseBackend(
    Object? decoded, {
    required DateTime fetchedAt,
    String source = 'backend',
  }) {
    if (decoded is! Map) return null;

    final days = DailyOutlook.parseAqOneList(decoded);
    if (days == null) return null;

    final hours = <HourlyInterval>[];
    final rawHours = decoded['hours'];
    if (rawHours is List) {
      for (final item in rawHours) {
        if (item is Map) {
          final timeStr = item['time'];
          if (timeStr is String) {
            final time = DateTime.tryParse(timeStr);
            if (time != null) {
              hours.add(
                HourlyInterval(
                  time: time,
                  weatherCode: _int(item['weather_code']),
                  tempC: _double(item['temp_c']),
                  windKph: _double(item['wind_kph']),
                  gustKph: _double(item['gust_kph']),
                  precipMm: _double(item['precip_mm']),
                  waveM: _double(item['wave_m']),
                ),
              );
            }
          }
        }
      }
    }

    final rawUnits = decoded['units'];
    final units = <String, String>{};
    if (rawUnits is Map) {
      for (final e in rawUnits.entries) {
        if (e.key is String && e.value is String) {
          units[e.key as String] = e.value as String;
        }
      }
    }

    final genStr = decoded['generated_at'];
    final backendSource =
        decoded['source'] is String ? decoded['source'] as String : source;

    return ForecastOutlook(
      days: days,
      hours: hours,
      fetchedAt: fetchedAt,
      generatedAt: genStr is String ? DateTime.tryParse(genStr) : null,
      latitude: _double(decoded['latitude']),
      longitude: _double(decoded['longitude']),
      timezone: decoded['timezone'] is String ? decoded['timezone'] as String : null,
      timezoneAbbreviation: decoded['timezone_abbreviation'] is String
          ? decoded['timezone_abbreviation'] as String
          : null,
      utcOffsetSeconds: _int(decoded['utc_offset_seconds']),
      source: backendSource,
      units: units,
    );
  }

  /// Parses direct Open-Meteo atmospheric and marine payloads (used in fallback).
  static ForecastOutlook? parseOpenMeteo({
    required Object? atmo,
    required Object? marine,
    required DateTime fetchedAt,
    double? lat,
    double? lon,
    double? marineLat,
    double? marineLon,
    String source = 'open-meteo-fallback',
  }) {
    if (atmo is! Map) return null;
    final List<DailyOutlook>? outlook = DailyOutlook.parseOpenMeteoList(atmo);
    if (outlook == null) return null;

    final Map<DateTime, double> wavesByDay =
        DailyOutlook.parseMarineDailyMax(marine);

    final days = outlook.map((day) {
      final key = DateTime(day.date.year, day.date.month, day.date.day);
      final wave = wavesByDay[key];
      return wave == null ? day : day.copyWith(waveM: wave);
    }).toList(growable: false);

    // Parse hourly marine wave heights by ISO timestamp string
    final marineWavesByTime = <String, double>{};
    if (marine is Map) {
      final hourly = marine['hourly'];
      if (hourly is Map) {
        final mTimes = hourly['time'];
        final mWaves = hourly['wave_height'];
        if (mTimes is List && mWaves is List) {
          final count =
              mTimes.length < mWaves.length ? mTimes.length : mWaves.length;
          for (int i = 0; i < count; i++) {
            final t = mTimes[i];
            final w = _double(mWaves[i]);
            if (t is String && w != null && w >= 0) {
              marineWavesByTime[t] = w;
            }
          }
        }
      }
    }

    // Parse hourly atmospheric series and join with marine
    final hours = <HourlyInterval>[];
    final hourly = atmo['hourly'];
    if (hourly is Map) {
      final aTimes = hourly['time'];
      if (aTimes is List) {
        final codes = hourly['weather_code'];
        final temps = hourly['temperature_2m'];
        final winds = hourly['wind_speed_10m'];
        final gusts = hourly['wind_gusts_10m'];
        final precips = hourly['precipitation'];

        for (int i = 0; i < aTimes.length; i++) {
          final tStr = aTimes[i];
          if (tStr is! String) continue;
          final time = DateTime.tryParse(tStr);
          if (time == null) continue;

          final wave = marineWavesByTime[tStr];
          hours.add(
            HourlyInterval(
              time: time,
              weatherCode: _int(_at(codes, i)),
              tempC: _double(_at(temps, i)),
              windKph: _double(_at(winds, i)),
              gustKph: _double(_at(gusts, i)),
              precipMm: _double(_at(precips, i)),
              waveM: wave,
            ),
          );
        }
      }
    }

    return ForecastOutlook(
      days: days,
      hours: hours,
      fetchedAt: fetchedAt,
      generatedAt: fetchedAt,
      latitude: _double(atmo['latitude']) ?? lat,
      longitude: _double(atmo['longitude']) ?? lon,
      timezone: atmo['timezone'] is String ? atmo['timezone'] as String : null,
      timezoneAbbreviation: atmo['timezone_abbreviation'] is String
          ? atmo['timezone_abbreviation'] as String
          : null,
      utcOffsetSeconds: _int(atmo['utc_offset_seconds']),
      source: source,
      marineSampleLat: marineLat,
      marineSampleLon: marineLon,
    );
  }

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
}
