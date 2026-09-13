import '../core/config.dart';
import '../data/forecast_cache.dart';
import '../models/daily_outlook.dart';
import '../models/forecast_outlook.dart';
import '../models/sea_condition.dart';
import '../models/squall_watch.dart';
import '../models/weather_snapshot.dart';

/// Machine-readable reasons why conditions deteriorated or caution/danger applies.
/// Display text lives in L10n extensions, never on this enum.
enum DeteriorationReason {
  strongWinds,
  highWaves,
  thunderstorm,
  heavyRain,
  poorVisibility,
  dailyRain,
  officialCaution,
  officialDanger,
  squallWatch,
  squallDanger,
}

/// The status of window availability.
/// Explains why an estimate is ready, unavailable, or incomplete.
enum FishingWindowAvailability {
  /// Complete contiguous data; positive window estimate available.
  available,

  /// Current conditions are already caution.
  currentCaution,

  /// Current conditions are already high risk / danger.
  currentDanger,

  /// Contiguous coverage extends through confident horizon without deterioration.
  noWorseningForecast,

  /// A future hazard is forecast, but earlier hourly data has gaps.
  earlierDataMissing,

  /// Only daily forecast is available; hourly estimate unavailable.
  missingHourly,

  /// Unrecognized code, missing wave, or missing wind during scan.
  incompleteData,

  /// Forecast retrieval age exceeds 30m refresh limit; refresh needed.
  staleRefreshNeeded,

  /// Forecast retrieval age exceeds 12h max cache age.
  expired,

  /// Forecast timestamp is in the future beyond allowable clock skew.
  clockSkew,

  /// Forecast is null or empty.
  noForecast,
}

/// The calculated result of the fishing weather window.
class FishingWindowResult {
  const FishingWindowResult({
    required this.currentRisk,
    this.upcomingRisk,
    this.deteriorationTime,
    this.durationUntilDeterioration,
    required this.availability,
    this.currentReason,
    this.upcomingReason,
    this.coverageEnd,
    this.firstAdverseDay,
    this.forecastFetchedAt,
    this.forecastSource,
    this.forecastLat,
    this.forecastLon,
  });

  final RiskLevel currentRisk;
  final RiskLevel? upcomingRisk;
  final DateTime? deteriorationTime;
  final Duration? durationUntilDeterioration;
  final FishingWindowAvailability availability;
  final DeteriorationReason? currentReason;
  final DeteriorationReason? upcomingReason;
  final DateTime? coverageEnd;
  final DateTime? firstAdverseDay;
  final DateTime? forecastFetchedAt;
  final String? forecastSource;
  final double? forecastLat;
  final double? forecastLon;

  /// Whether a positive safe window countdown is valid and present.
  bool get hasPositiveWindow =>
      availability == FishingWindowAvailability.available &&
      durationUntilDeterioration != null &&
      !durationUntilDeterioration!.isNegative;

  /// Whole days component of positive window, rounded down.
  int? get windowDays => durationUntilDeterioration != null
      ? durationUntilDeterioration!.inHours ~/ 24
      : null;

  /// Remaining hours component of positive window.
  int? get windowHours => durationUntilDeterioration != null
      ? durationUntilDeterioration!.inHours % 24
      : null;

  /// True when the remaining window is under one hour.
  bool get isUnderOneHour =>
      durationUntilDeterioration != null &&
      durationUntilDeterioration!.inMinutes < 60;
}

/// Deterministic calculation of the fishing weather window.
class FishingWindowCalculator {
  const FishingWindowCalculator._();

  static FishingWindowResult calculate({
    required ForecastOutlook? forecast,
    SeaCondition? seaCondition,
    SquallWatch? squall,
    required DateTime now,
    Duration refreshMaxAge = const Duration(minutes: 30),
    Duration cacheMaxAge = ForecastCache.maxAge,
    int confidentDays = AqOneConfig.forecastConfidentDays,
  }) {
    if (forecast == null) {
      return const FishingWindowResult(
        currentRisk: RiskLevel.unknown,
        availability: FishingWindowAvailability.noForecast,
      );
    }

    final DateTime fetchedAt = forecast.fetchedAt;

    // 1. Check clock skew (> 1 min in the future)
    if (fetchedAt.isAfter(now.add(ForecastCache.maxFutureSkew))) {
      return FishingWindowResult(
        currentRisk: RiskLevel.unknown,
        availability: FishingWindowAvailability.clockSkew,
        forecastFetchedAt: fetchedAt,
        forecastSource: forecast.source,
        forecastLat: forecast.latitude,
        forecastLon: forecast.longitude,
      );
    }

    // 2. Check cache expiration (> 12h)
    if (now.difference(fetchedAt) > cacheMaxAge) {
      return FishingWindowResult(
        currentRisk: RiskLevel.unknown,
        availability: FishingWindowAvailability.expired,
        forecastFetchedAt: fetchedAt,
        forecastSource: forecast.source,
        forecastLat: forecast.latitude,
        forecastLon: forecast.longitude,
      );
    }

    // 3. Official warnings and squall alerts precedence:
    // Danger: official notAdvised or squall returnNow
    final bool squallDanger =
        squall?.returnNow == true || squall?.level == SquallLevel.returnNow;
    final bool officialDanger = seaCondition?.status == SeaStatus.notAdvised;
    if (squallDanger || officialDanger) {
      return FishingWindowResult(
        currentRisk: RiskLevel.danger,
        currentReason: squallDanger
            ? DeteriorationReason.squallDanger
            : DeteriorationReason.officialDanger,
        availability: FishingWindowAvailability.currentDanger,
        forecastFetchedAt: fetchedAt,
        forecastSource: forecast.source,
        forecastLat: forecast.latitude,
        forecastLon: forecast.longitude,
      );
    }

    // Caution: official caution or squall watch
    final bool squallCaution = squall?.level == SquallLevel.watch;
    final bool officialCaution = seaCondition?.status == SeaStatus.caution;
    if (squallCaution || officialCaution) {
      return FishingWindowResult(
        currentRisk: RiskLevel.caution,
        currentReason: squallCaution
            ? DeteriorationReason.squallWatch
            : DeteriorationReason.officialCaution,
        availability: FishingWindowAvailability.currentCaution,
        forecastFetchedAt: fetchedAt,
        forecastSource: forecast.source,
        forecastLat: forecast.latitude,
        forecastLon: forecast.longitude,
      );
    }

    final bool isStale = now.difference(fetchedAt) > refreshMaxAge;

    // 4. Check if hourly data is missing (daily-only fallback)
    if (!forecast.hasHourly) {
      DateTime? firstAdverse;
      RiskLevel dailyCurrentRisk = RiskLevel.safe;
      DeteriorationReason? dailyCurrentReason;

      for (final day in forecast.days) {
        final isToday = day.isToday ||
            (day.date.year == now.year &&
                day.date.month == now.month &&
                day.date.day == now.day);
        if (isToday) {
          if (day.risk.level == RiskLevel.danger) {
            dailyCurrentRisk = RiskLevel.danger;
            dailyCurrentReason = _reasonFromDaily(day);
          } else if (day.risk.level == RiskLevel.caution &&
              dailyCurrentRisk != RiskLevel.danger) {
            dailyCurrentRisk = RiskLevel.caution;
            dailyCurrentReason = _reasonFromDaily(day);
          }
        } else if (day.date.isAfter(now)) {
          if (day.risk.level == RiskLevel.caution ||
              day.risk.level == RiskLevel.danger) {
            firstAdverse ??= day.date;
          }
        }
      }

      final FishingWindowAvailability avail =
          dailyCurrentRisk == RiskLevel.danger
              ? FishingWindowAvailability.currentDanger
              : dailyCurrentRisk == RiskLevel.caution
                  ? FishingWindowAvailability.currentCaution
                  : FishingWindowAvailability.missingHourly;

      return FishingWindowResult(
        currentRisk: dailyCurrentRisk,
        currentReason: dailyCurrentReason,
        firstAdverseDay: firstAdverse,
        availability: avail,
        forecastFetchedAt: fetchedAt,
        forecastSource: forecast.source,
        forecastLat: forecast.latitude,
        forecastLon: forecast.longitude,
      );
    }

    // 5. Hourly scanning
    final sortedHours = List<HourlyInterval>.from(forecast.hours)
      ..sort((a, b) => a.time.compareTo(b.time));

    final horizonEnd = now.add(Duration(days: confidentDays));

    // Find interval covering 'now':
    // Each interval with timestamp T covers [T - 1h, T]
    HourlyInterval? currentHour;
    final futureHours = <HourlyInterval>[];

    for (final h in sortedHours) {
      final start = h.time.subtract(const Duration(hours: 1));
      final end = h.time;
      if (!end.isAfter(now)) {
        // Interval ended in the past
        continue;
      }
      if (!start.isAfter(now) && now.isBefore(end)) {
        currentHour = h;
      } else {
        futureHours.add(h);
      }
    }

    // Check current hour:
    if (currentHour != null) {
      final currentAssessment = _assessHour(currentHour);
      if (currentAssessment.level == RiskLevel.danger) {
        return FishingWindowResult(
          currentRisk: RiskLevel.danger,
          currentReason: currentAssessment.reason,
          availability: FishingWindowAvailability.currentDanger,
          forecastFetchedAt: fetchedAt,
          forecastSource: forecast.source,
          forecastLat: forecast.latitude,
          forecastLon: forecast.longitude,
        );
      }
      if (currentAssessment.level == RiskLevel.caution) {
        return FishingWindowResult(
          currentRisk: RiskLevel.caution,
          currentReason: currentAssessment.reason,
          availability: FishingWindowAvailability.currentCaution,
          forecastFetchedAt: fetchedAt,
          forecastSource: forecast.source,
          forecastLat: forecast.latitude,
          forecastLon: forecast.longitude,
        );
      }
      if (currentAssessment.isIncomplete) {
        return FishingWindowResult(
          currentRisk: RiskLevel.unknown,
          availability: FishingWindowAvailability.incompleteData,
          forecastFetchedAt: fetchedAt,
          forecastSource: forecast.source,
          forecastLat: forecast.latitude,
          forecastLon: forecast.longitude,
        );
      }
    } else {
      // If no interval covers 'now', check if first future hour starts near 'now'
      if (futureHours.isEmpty) {
        return FishingWindowResult(
          currentRisk: RiskLevel.unknown,
          availability: FishingWindowAvailability.incompleteData,
          forecastFetchedAt: fetchedAt,
          forecastSource: forecast.source,
          forecastLat: forecast.latitude,
          forecastLon: forecast.longitude,
        );
      }
      final firstStart =
          futureHours.first.time.subtract(const Duration(hours: 1));
      if (firstStart.difference(now) > const Duration(minutes: 15)) {
        // Gap between now and first future hour!
        for (final h in futureHours) {
          final hRisk = _assessHour(h);
          if (hRisk.level == RiskLevel.caution ||
              hRisk.level == RiskLevel.danger) {
            return FishingWindowResult(
              currentRisk: RiskLevel.safe,
              upcomingRisk: hRisk.level,
              upcomingReason: hRisk.reason,
              deteriorationTime: h.time.subtract(const Duration(hours: 1)),
              availability: FishingWindowAvailability.earlierDataMissing,
              forecastFetchedAt: fetchedAt,
              forecastSource: forecast.source,
              forecastLat: forecast.latitude,
              forecastLon: forecast.longitude,
            );
          }
        }
        return FishingWindowResult(
          currentRisk: RiskLevel.safe,
          availability: FishingWindowAvailability.incompleteData,
          forecastFetchedAt: fetchedAt,
          forecastSource: forecast.source,
          forecastLat: forecast.latitude,
          forecastLon: forecast.longitude,
        );
      }
    }

    // Current hour is safe.
    // Check Rule 5: Daily rain threshold on today
    for (final day in forecast.days) {
      final isToday = day.isToday ||
          (day.date.year == now.year &&
              day.date.month == now.month &&
              day.date.day == now.day);
      if (isToday) {
        if (day.precipMm != null &&
            day.precipMm! >= AqOneConfig.dangerPrecipMm) {
          return FishingWindowResult(
            currentRisk: RiskLevel.danger,
            currentReason: DeteriorationReason.dailyRain,
            availability: FishingWindowAvailability.currentDanger,
            forecastFetchedAt: fetchedAt,
            forecastSource: forecast.source,
            forecastLat: forecast.latitude,
            forecastLon: forecast.longitude,
          );
        }
        if (day.precipMm != null &&
            day.precipMm! >= AqOneConfig.cautionPrecipMm) {
          return FishingWindowResult(
            currentRisk: RiskLevel.caution,
            currentReason: DeteriorationReason.dailyRain,
            availability: FishingWindowAvailability.currentCaution,
            forecastFetchedAt: fetchedAt,
            forecastSource: forecast.source,
            forecastLat: forecast.latitude,
            forecastLon: forecast.longitude,
          );
        }
      }
    }

    // Scan future hours:
    DateTime lastEnd = currentHour?.time ?? now;
    bool hasGap = false;

    DateTime? deteriorationTime;
    Duration? durationUntilDeterioration;
    RiskLevel? upcomingRisk;
    DeteriorationReason? upcomingReason;
    DateTime lastUsableCoverageEnd = lastEnd;

    for (final h in futureHours) {
      final intervalStart = h.time.subtract(const Duration(hours: 1));
      if (intervalStart.isAfter(horizonEnd)) {
        break;
      }

      // Gap detection: gap > 15 mins between lastEnd and intervalStart
      if (intervalStart.difference(lastEnd) > const Duration(minutes: 15)) {
        hasGap = true;
      }

      final hRisk = _assessHour(h);

      if (hRisk.level == RiskLevel.caution || hRisk.level == RiskLevel.danger) {
        deteriorationTime = intervalStart;
        upcomingRisk = hRisk.level;
        upcomingReason = hRisk.reason;
        if (!hasGap) {
          durationUntilDeterioration = deteriorationTime.difference(now);
        }
        break;
      }

      if (hRisk.isIncomplete) {
        hasGap = true;
      } else if (!hasGap) {
        lastUsableCoverageEnd = h.time;
      }

      lastEnd = h.time;

      // Check daily rain restriction for day enclosing this interval
      for (final day in forecast.days) {
        final dayStart = DateTime(day.date.year, day.date.month, day.date.day);
        final dayEnd = dayStart.add(const Duration(days: 1));
        if (h.time.isAfter(dayStart) && !h.time.isAfter(dayEnd)) {
          if (day.precipMm != null &&
              day.precipMm! >= AqOneConfig.cautionPrecipMm) {
            final isDanger = day.precipMm! >= AqOneConfig.dangerPrecipMm;
            deteriorationTime =
                dayStart.isAfter(now) ? dayStart : intervalStart;
            upcomingRisk = isDanger ? RiskLevel.danger : RiskLevel.caution;
            upcomingReason = DeteriorationReason.dailyRain;
            if (!hasGap) {
              durationUntilDeterioration = deteriorationTime.difference(now);
            }
            break;
          }
        }
      }
      if (deteriorationTime != null) {
        break;
      }
    }

    // Determine availability and return result:
    if (deteriorationTime != null) {
      if (hasGap) {
        return FishingWindowResult(
          currentRisk: RiskLevel.safe,
          upcomingRisk: upcomingRisk,
          upcomingReason: upcomingReason,
          deteriorationTime: deteriorationTime,
          durationUntilDeterioration: null,
          availability: FishingWindowAvailability.earlierDataMissing,
          coverageEnd: lastUsableCoverageEnd,
          forecastFetchedAt: fetchedAt,
          forecastSource: forecast.source,
          forecastLat: forecast.latitude,
          forecastLon: forecast.longitude,
        );
      }

      return FishingWindowResult(
        currentRisk: RiskLevel.safe,
        upcomingRisk: upcomingRisk,
        upcomingReason: upcomingReason,
        deteriorationTime: deteriorationTime,
        durationUntilDeterioration: durationUntilDeterioration,
        availability: isStale
            ? FishingWindowAvailability.staleRefreshNeeded
            : FishingWindowAvailability.available,
        coverageEnd: lastUsableCoverageEnd,
        forecastFetchedAt: fetchedAt,
        forecastSource: forecast.source,
        forecastLat: forecast.latitude,
        forecastLon: forecast.longitude,
      );
    }

    if (hasGap) {
      return FishingWindowResult(
        currentRisk: RiskLevel.safe,
        availability: FishingWindowAvailability.incompleteData,
        coverageEnd: lastUsableCoverageEnd,
        forecastFetchedAt: fetchedAt,
        forecastSource: forecast.source,
        forecastLat: forecast.latitude,
        forecastLon: forecast.longitude,
      );
    }

    final effectiveCoverageEnd = lastUsableCoverageEnd.isBefore(horizonEnd)
        ? lastUsableCoverageEnd
        : horizonEnd;

    return FishingWindowResult(
      currentRisk: RiskLevel.safe,
      availability: isStale
          ? FishingWindowAvailability.staleRefreshNeeded
          : FishingWindowAvailability.noWorseningForecast,
      coverageEnd: effectiveCoverageEnd,
      forecastFetchedAt: fetchedAt,
      forecastSource: forecast.source,
      forecastLat: forecast.latitude,
      forecastLon: forecast.longitude,
    );
  }

  static _HourRisk _assessHour(HourlyInterval h) {
    final double? gust = h.gustKph ?? h.windKph;
    final double? wave = h.waveM;
    final WeatherCondition? condition = h.condition;

    // Check Danger first
    if (gust != null && gust >= AqOneConfig.dangerGustKph) {
      return const _HourRisk(RiskLevel.danger, DeteriorationReason.strongWinds);
    }
    if (wave != null && wave >= AqOneConfig.dangerWaveM) {
      return const _HourRisk(RiskLevel.danger, DeteriorationReason.highWaves);
    }
    if (condition == WeatherCondition.severeThunderstorm ||
        condition == WeatherCondition.thunderstorm) {
      return const _HourRisk(RiskLevel.danger, DeteriorationReason.thunderstorm);
    }

    // Check Caution next
    if (gust != null && gust >= AqOneConfig.cautionGustKph) {
      return const _HourRisk(RiskLevel.caution, DeteriorationReason.strongWinds);
    }
    if (wave != null && wave >= AqOneConfig.cautionWaveM) {
      return const _HourRisk(RiskLevel.caution, DeteriorationReason.highWaves);
    }
    if (condition == WeatherCondition.heavyRain ||
        condition == WeatherCondition.rainy ||
        condition == WeatherCondition.showers) {
      return const _HourRisk(RiskLevel.caution, DeteriorationReason.heavyRain);
    }
    if (condition == WeatherCondition.foggy) {
      return const _HourRisk(RiskLevel.caution, DeteriorationReason.poorVisibility);
    }

    // If no danger or caution triggered, check data completeness:
    if (gust == null || wave == null || condition == null) {
      return const _HourRisk(RiskLevel.unknown, null, isIncomplete: true);
    }

    return const _HourRisk(RiskLevel.safe, null);
  }

  static DeteriorationReason? _reasonFromDaily(DailyOutlook d) {
    final gust = d.gustKph ?? d.windKph;
    if (gust != null && gust >= AqOneConfig.cautionGustKph) {
      return DeteriorationReason.strongWinds;
    }
    if (d.waveM != null && d.waveM! >= AqOneConfig.cautionWaveM) {
      return DeteriorationReason.highWaves;
    }
    if (d.condition == WeatherCondition.thunderstorm ||
        d.condition == WeatherCondition.severeThunderstorm) {
      return DeteriorationReason.thunderstorm;
    }
    if (d.condition == WeatherCondition.heavyRain ||
        d.condition == WeatherCondition.rainy ||
        d.condition == WeatherCondition.showers) {
      return DeteriorationReason.heavyRain;
    }
    if (d.condition == WeatherCondition.foggy) {
      return DeteriorationReason.poorVisibility;
    }
    if (d.precipMm != null && d.precipMm! >= AqOneConfig.cautionPrecipMm) {
      return DeteriorationReason.dailyRain;
    }
    return null;
  }
}

class _HourRisk {
  const _HourRisk(this.level, this.reason, {this.isIncomplete = false});
  final RiskLevel level;
  final DeteriorationReason? reason;
  final bool isIncomplete;
}
