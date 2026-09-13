import '../core/config.dart';
import '../data/forecast_cache.dart';
import '../l10n/app_localizations.dart';
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

/// Localized labels for deterioration reasons.
extension DeteriorationReasonL10n on DeteriorationReason {
  String label(AppLocalizations t) => switch (this) {
        DeteriorationReason.strongWinds => t.deteriorationReasonStrongWinds,
        DeteriorationReason.highWaves => t.deteriorationReasonHighWaves,
        DeteriorationReason.thunderstorm => t.deteriorationReasonThunderstorm,
        DeteriorationReason.heavyRain => t.deteriorationReasonHeavyRain,
        DeteriorationReason.poorVisibility => t.deteriorationReasonPoorVisibility,
        DeteriorationReason.dailyRain => t.deteriorationReasonDailyRain,
        DeteriorationReason.officialCaution => t.deteriorationReasonOfficialCaution,
        DeteriorationReason.officialDanger => t.deteriorationReasonOfficialDanger,
        DeteriorationReason.squallWatch => t.deteriorationReasonSquallWatch,
        DeteriorationReason.squallDanger => t.deteriorationReasonSquallDanger,
      };
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
    // 1. Warning precedence and warning floor
    final bool squallDanger =
        squall?.returnNow == true || squall?.level == SquallLevel.returnNow;
    final bool officialDanger = seaCondition?.status == SeaStatus.notAdvised;
    final bool squallCaution = squall?.level == SquallLevel.watch;
    final bool officialCaution = seaCondition?.status == SeaStatus.caution;

    final RiskLevel warningRisk = (squallDanger || officialDanger)
        ? RiskLevel.danger
        : (squallCaution || officialCaution)
            ? RiskLevel.caution
            : RiskLevel.safe;

    final DeteriorationReason? warningReason = squallDanger
        ? DeteriorationReason.squallDanger
        : officialDanger
            ? DeteriorationReason.officialDanger
            : squallCaution
                ? DeteriorationReason.squallWatch
                : officialCaution
                    ? DeteriorationReason.officialCaution
                    : null;

    // Warning danger always wins immediately regardless of forecast availability
    if (warningRisk == RiskLevel.danger) {
      return FishingWindowResult(
        currentRisk: RiskLevel.danger,
        currentReason: warningReason,
        availability: FishingWindowAvailability.currentDanger,
      );
    }

    // 2. If forecast is null, warning caution takes precedence over unknown/noForecast
    if (forecast == null) {
      if (warningRisk == RiskLevel.caution) {
        return FishingWindowResult(
          currentRisk: RiskLevel.caution,
          currentReason: warningReason,
          availability: FishingWindowAvailability.currentCaution,
        );
      }
      return const FishingWindowResult(
        currentRisk: RiskLevel.unknown,
        availability: FishingWindowAvailability.noForecast,
      );
    }

    final DateTime fetchedAt = forecast.fetchedAt;

    // 3. Check clock skew (> 1 min in the future)
    if (fetchedAt.isAfter(now.add(ForecastCache.maxFutureSkew))) {
      if (warningRisk == RiskLevel.caution) {
        return FishingWindowResult(
          currentRisk: RiskLevel.caution,
          currentReason: warningReason,
          availability: FishingWindowAvailability.currentCaution,
        );
      }
      return const FishingWindowResult(
        currentRisk: RiskLevel.unknown,
        availability: FishingWindowAvailability.clockSkew,
      );
    }

    // 4. Check cache expiration (> 12h)
    if (now.difference(fetchedAt) > cacheMaxAge) {
      if (warningRisk == RiskLevel.caution) {
        return FishingWindowResult(
          currentRisk: RiskLevel.caution,
          currentReason: warningReason,
          availability: FishingWindowAvailability.currentCaution,
        );
      }
      return const FishingWindowResult(
        currentRisk: RiskLevel.unknown,
        availability: FishingWindowAvailability.expired,
      );
    }

    final bool isStale = now.difference(fetchedAt) > refreshMaxAge;

    // 5. Check if hourly data is missing (daily-only fallback)
    if (!forecast.hasHourly) {
      DateTime? firstAdverse;
      RiskLevel dailyCurrentRisk = warningRisk;
      DeteriorationReason? dailyCurrentReason = warningReason;

      for (final day in forecast.days) {
        final isToday = day.date.year == now.year &&
            day.date.month == now.month &&
            day.date.day == now.day;
        if (isToday) {
          if (day.risk.level == RiskLevel.danger) {
            dailyCurrentRisk = RiskLevel.danger;
            dailyCurrentReason = _reasonFromDaily(day);
          } else if (day.risk.level == RiskLevel.caution &&
              dailyCurrentRisk != RiskLevel.danger) {
            dailyCurrentRisk = RiskLevel.caution;
            dailyCurrentReason = dailyCurrentReason ?? _reasonFromDaily(day);
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
      );
    }

    // 6. Conservative deduplication across intervals
    final Map<DateTime, HourlyInterval> deduplicatedHours =
        <DateTime, HourlyInterval>{};
    for (final h in forecast.hours) {
      final existing = deduplicatedHours[h.time];
      if (existing == null) {
        deduplicatedHours[h.time] = h;
      } else {
        deduplicatedHours[h.time] = HourlyInterval(
          time: h.time,
          weatherCode: ForecastOutlook.moreSevereWeatherCode(
              existing.weatherCode, h.weatherCode),
          tempC: existing.tempC ?? h.tempC,
          windKph: ForecastOutlook.maxNullable(existing.windKph, h.windKph),
          gustKph: ForecastOutlook.maxNullable(existing.gustKph, h.gustKph),
          precipMm: ForecastOutlook.maxNullable(existing.precipMm, h.precipMm),
          waveM: ForecastOutlook.maxNullable(existing.waveM, h.waveM),
        );
      }
    }
    final sortedHours = deduplicatedHours.values.toList()
      ..sort((a, b) => a.time.compareTo(b.time));

    final horizonEnd = now.add(Duration(days: confidentDays));

    // 7. Evaluate current conditions
    RiskLevel currentRisk = warningRisk;
    DeteriorationReason? currentReason = warningReason;
    bool currentIsIncomplete = false;

    void applyCurrentRisk(RiskLevel level, DeteriorationReason? reason) {
      if (level == RiskLevel.danger) {
        currentRisk = RiskLevel.danger;
        currentReason = reason;
      } else if (level == RiskLevel.caution && currentRisk != RiskLevel.danger) {
        currentRisk = RiskLevel.caution;
        currentReason = reason;
      }
    }

    // Today daily rain check using injected now
    for (final day in forecast.days) {
      final isToday = day.date.year == now.year &&
          day.date.month == now.month &&
          day.date.day == now.day;
      if (isToday && day.precipMm != null) {
        if (day.precipMm! >= AqOneConfig.dangerPrecipMm) {
          applyCurrentRisk(RiskLevel.danger, DeteriorationReason.dailyRain);
        } else if (day.precipMm! >= AqOneConfig.cautionPrecipMm) {
          applyCurrentRisk(RiskLevel.caution, DeteriorationReason.dailyRain);
        }
      }
    }

    // Instantaneous wave covering now:
    // Check samples at now or nearest past/covering interval
    HourlyInterval? waveSampleAtNow;
    for (final h in sortedHours) {
      if (h.waveM != null) {
        if (h.time == now) {
          waveSampleAtNow = h;
          break;
        } else if (!h.time.isAfter(now) &&
            now.difference(h.time) <= const Duration(hours: 1)) {
          waveSampleAtNow = h;
        } else if (waveSampleAtNow == null &&
            h.time.isAfter(now) &&
            !h.time.subtract(const Duration(hours: 1)).isAfter(now)) {
          waveSampleAtNow = h;
        }
      }
    }
    if (waveSampleAtNow?.waveM != null) {
      final w = waveSampleAtNow!.waveM!;
      if (w >= AqOneConfig.dangerWaveM) {
        applyCurrentRisk(RiskLevel.danger, DeteriorationReason.highWaves);
      } else if (w >= AqOneConfig.cautionWaveM) {
        applyCurrentRisk(RiskLevel.caution, DeteriorationReason.highWaves);
      }
    }

    // Atmospheric interval covering now:
    // Interval with timestamp T covers [T - 1h, T]
    HourlyInterval? currentHour;
    for (final h in sortedHours) {
      final start = h.time.subtract(const Duration(hours: 1));
      final end = h.time;
      if (!start.isAfter(now) && (now.isBefore(end) || (h.time == now && now == end))) {
        currentHour = h;
        break;
      }
    }

    if (currentHour != null) {
      final hRisk = _assessHour(currentHour);
      if (hRisk.level == RiskLevel.danger) {
        applyCurrentRisk(RiskLevel.danger, hRisk.reason);
      } else if (hRisk.level == RiskLevel.caution) {
        applyCurrentRisk(RiskLevel.caution, hRisk.reason);
      } else if (hRisk.isIncomplete) {
        currentIsIncomplete = true;
      }
    }

    if (currentRisk == RiskLevel.danger) {
      return FishingWindowResult(
        currentRisk: RiskLevel.danger,
        currentReason: currentReason,
        availability: FishingWindowAvailability.currentDanger,
      );
    }
    if (currentRisk == RiskLevel.caution) {
      return FishingWindowResult(
        currentRisk: RiskLevel.caution,
        currentReason: currentReason,
        availability: FishingWindowAvailability.currentCaution,
      );
    }
    if (currentIsIncomplete && currentHour == null) {
      return const FishingWindowResult(
        currentRisk: RiskLevel.unknown,
        availability: FishingWindowAvailability.incompleteData,
      );
    }

    // 8. Future hours scanning
    final futureHours = sortedHours.where((h) => h.time.isAfter(now)).toList();
    if (futureHours.isEmpty) {
      return const FishingWindowResult(
        currentRisk: RiskLevel.unknown,
        availability: FishingWindowAvailability.incompleteData,
      );
    }

    final firstStart =
        futureHours.first.time.subtract(const Duration(hours: 1));
    if (firstStart.difference(now) > const Duration(minutes: 15)) {
      // Gap before first future hour
      for (final h in futureHours) {
        final hRisk = _assessHour(h);
        if (hRisk.level == RiskLevel.caution ||
            hRisk.level == RiskLevel.danger) {
          final isWaveOnly = hRisk.reason == DeteriorationReason.highWaves &&
              !(h.gustKph != null &&
                  h.gustKph! >=
                      (hRisk.level == RiskLevel.danger
                          ? AqOneConfig.dangerGustKph
                          : AqOneConfig.cautionGustKph)) &&
              !(h.condition == WeatherCondition.severeThunderstorm ||
                  h.condition == WeatherCondition.thunderstorm ||
                  h.condition == WeatherCondition.heavyRain ||
                  h.condition == WeatherCondition.rainy ||
                  h.condition == WeatherCondition.showers ||
                  h.condition == WeatherCondition.foggy);
          final onset = isWaveOnly ? h.time : h.time.subtract(const Duration(hours: 1));
          return FishingWindowResult(
            currentRisk: RiskLevel.safe,
            upcomingRisk: hRisk.level,
            upcomingReason: hRisk.reason,
            deteriorationTime: onset,
            availability: FishingWindowAvailability.earlierDataMissing,
          );
        }
      }
      return const FishingWindowResult(
        currentRisk: RiskLevel.safe,
        availability: FishingWindowAvailability.incompleteData,
      );
    }

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

      if (intervalStart.difference(lastEnd) > const Duration(minutes: 15)) {
        hasGap = true;
      }

      final hRisk = _assessHour(h);
      if (hRisk.level == RiskLevel.caution || hRisk.level == RiskLevel.danger) {
        final isWaveOnly = hRisk.reason == DeteriorationReason.highWaves &&
            !(h.gustKph != null &&
                h.gustKph! >=
                    (hRisk.level == RiskLevel.danger
                        ? AqOneConfig.dangerGustKph
                        : AqOneConfig.cautionGustKph)) &&
            !(h.condition == WeatherCondition.severeThunderstorm ||
                h.condition == WeatherCondition.thunderstorm ||
                h.condition == WeatherCondition.heavyRain ||
                h.condition == WeatherCondition.rainy ||
                h.condition == WeatherCondition.showers ||
                h.condition == WeatherCondition.foggy);

        final onset = isWaveOnly ? h.time : intervalStart;
        deteriorationTime = onset;
        upcomingRisk = hRisk.level;
        upcomingReason = hRisk.reason;
        if (!hasGap && !onset.isBefore(now)) {
          durationUntilDeterioration = onset.difference(now);
        }
        break;
      }

      if (hRisk.isIncomplete) {
        hasGap = true;
      } else if (!hasGap) {
        lastUsableCoverageEnd = h.time;
      }

      lastEnd = h.time;
    }

    // If deterioration occurred from hourly data
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
      );
    }

    // If hourly data had a gap
    if (hasGap) {
      return FishingWindowResult(
        currentRisk: RiskLevel.safe,
        availability: FishingWindowAvailability.incompleteData,
        coverageEnd: lastUsableCoverageEnd,
      );
    }

    // Check future daily rain restrictions (date-level, no invented midnight countdown)
    for (final day in forecast.days) {
      final isFutureDay = (day.date.year > now.year) ||
          (day.date.year == now.year && day.date.month > now.month) ||
          (day.date.year == now.year &&
              day.date.month == now.month &&
              day.date.day > now.day);
      if (isFutureDay &&
          day.precipMm != null &&
          day.precipMm! >= AqOneConfig.cautionPrecipMm) {
        final isDanger = day.precipMm! >= AqOneConfig.dangerPrecipMm;
        return FishingWindowResult(
          currentRisk: RiskLevel.safe,
          upcomingRisk: isDanger ? RiskLevel.danger : RiskLevel.caution,
          upcomingReason: DeteriorationReason.dailyRain,
          firstAdverseDay: day.date,
          availability: FishingWindowAvailability.missingHourly,
          coverageEnd: lastUsableCoverageEnd,
        );
      }
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
    );
  }

  static _HourRisk _assessHour(HourlyInterval h) {
    final double? gust = h.gustKph;
    final double? wind = h.windKph;
    final double? wave = h.waveM;
    final WeatherCondition? condition = h.condition;

    // Check Danger first (known adverse evidence elevates risk even if other fields are missing)
    if ((gust != null && gust >= AqOneConfig.dangerGustKph) ||
        (wind != null && wind >= AqOneConfig.dangerGustKph)) {
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
    if ((gust != null && gust >= AqOneConfig.cautionGustKph) ||
        (wind != null && wind >= AqOneConfig.cautionGustKph)) {
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

    // Completeness check: gust is required for green (never replace missing gust with mean wind)
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
