import 'package:aqone/models/daily_outlook.dart';
import 'package:aqone/models/forecast_outlook.dart';
import 'package:aqone/models/sea_condition.dart';
import 'package:aqone/models/squall_watch.dart';
import 'package:aqone/services/fishing_window.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final DateTime fixedNow = DateTime.parse('2026-08-16T08:00:00Z');

  HourlyInterval hour({
    required int hoursFromNow,
    int? code = 1,
    double? gust = 15.0,
    double? wave = 0.8,
    double? temp = 28.0,
    double? precip = 0.0,
  }) {
    // An interval with timestamp T covers [T - 1h, T]
    final time = fixedNow.add(Duration(hours: hoursFromNow));
    return HourlyInterval(
      time: time,
      weatherCode: code,
      gustKph: gust,
      waveM: wave,
      tempC: temp,
      precipMm: precip,
    );
  }

  ForecastOutlook makeOutlook({
    required List<HourlyInterval> hours,
    List<DailyOutlook>? days,
    DateTime? fetchedAt,
    String source = 'backend',
  }) {
    final defaultDays = days ??
        <DailyOutlook>[
          DailyOutlook(
            date: DateTime.parse('2026-08-16'),
            weatherCode: 1,
            risk: const RiskAssessment(
              level: RiskLevel.safe,
              source: RiskSource.device,
            ),
          ),
          DailyOutlook(
            date: DateTime.parse('2026-08-17'),
            weatherCode: 1,
            risk: const RiskAssessment(
              level: RiskLevel.safe,
              source: RiskSource.device,
            ),
          ),
          DailyOutlook(
            date: DateTime.parse('2026-08-18'),
            weatherCode: 1,
            risk: const RiskAssessment(
              level: RiskLevel.safe,
              source: RiskSource.device,
            ),
          ),
        ];

    return ForecastOutlook(
      days: defaultDays,
      hours: hours,
      fetchedAt: fetchedAt ?? fixedNow.subtract(const Duration(minutes: 5)),
      source: source,
      latitude: 11.68,
      longitude: 122.41,
    );
  }

  group('FishingWindowCalculator - Acceptance Matrix', () {
    test('Scenario 1: Complete recent low-risk coverage; first caution interval in 30 hours', () {
      // 30 hours of safe weather, then strong wind (caution)
      final hours = <HourlyInterval>[
        // Hour covering now: [now, now + 1h] -> timestamp at now + 1h
        hour(hoursFromNow: 1),
      ];
      for (int i = 2; i <= 30; i++) {
        hours.add(hour(hoursFromNow: i));
      }
      // At hour 31 (covering [now + 30h, now + 31h]), gust reaches 35 km/h
      hours.add(hour(hoursFromNow: 31, gust: 35.0));

      final outlook = makeOutlook(hours: hours);
      final result = FishingWindowCalculator.calculate(
        forecast: outlook,
        now: fixedNow,
      );

      expect(result.currentRisk, RiskLevel.safe);
      expect(result.upcomingRisk, RiskLevel.caution);
      expect(result.upcomingReason, DeteriorationReason.strongWinds);
      expect(result.hasPositiveWindow, isTrue);
      expect(result.windowDays, 1);
      expect(result.windowHours, 6);
      expect(result.deteriorationTime, fixedNow.add(const Duration(hours: 30)));
      expect(result.availability, FishingWindowAvailability.available);
    });

    test('Scenario 2: Current interval already caution/danger shows no positive window', () {
      final hours = <HourlyInterval>[
        // Current interval (ending at now + 1h) has danger gusts
        hour(hoursFromNow: 1, gust: 55.0),
        hour(hoursFromNow: 2),
      ];

      final outlook = makeOutlook(hours: hours);
      final result = FishingWindowCalculator.calculate(
        forecast: outlook,
        now: fixedNow,
      );

      expect(result.currentRisk, RiskLevel.danger);
      expect(result.currentReason, DeteriorationReason.strongWinds);
      expect(result.hasPositiveWindow, isFalse);
      expect(result.availability, FishingWindowAvailability.currentDanger);
    });

    test('Scenario 3: Gust or wave exactly at thresholds escalates inclusively', () {
      // Exactly 30 km/h is caution
      final cautionGustHours = <HourlyInterval>[
        hour(hoursFromNow: 1),
        hour(hoursFromNow: 2, gust: 30.0),
      ];
      final res1 = FishingWindowCalculator.calculate(
        forecast: makeOutlook(hours: cautionGustHours),
        now: fixedNow,
      );
      expect(res1.upcomingRisk, RiskLevel.caution);
      expect(res1.upcomingReason, DeteriorationReason.strongWinds);

      // Exactly 50 km/h is danger
      final dangerGustHours = <HourlyInterval>[
        hour(hoursFromNow: 1),
        hour(hoursFromNow: 2, gust: 50.0),
      ];
      final res2 = FishingWindowCalculator.calculate(
        forecast: makeOutlook(hours: dangerGustHours),
        now: fixedNow,
      );
      expect(res2.upcomingRisk, RiskLevel.danger);
      expect(res2.upcomingReason, DeteriorationReason.strongWinds);

      // Exactly 1.5m wave is caution
      final cautionWaveHours = <HourlyInterval>[
        hour(hoursFromNow: 1),
        hour(hoursFromNow: 2, wave: 1.5),
      ];
      final res3 = FishingWindowCalculator.calculate(
        forecast: makeOutlook(hours: cautionWaveHours),
        now: fixedNow,
      );
      expect(res3.upcomingRisk, RiskLevel.caution);
      expect(res3.upcomingReason, DeteriorationReason.highWaves);

      // Exactly 2.5m wave is danger
      final dangerWaveHours = <HourlyInterval>[
        hour(hoursFromNow: 1),
        hour(hoursFromNow: 2, wave: 2.5),
      ];
      final res4 = FishingWindowCalculator.calculate(
        forecast: makeOutlook(hours: dangerWaveHours),
        now: fixedNow,
      );
      expect(res4.upcomingRisk, RiskLevel.danger);
      expect(res4.upcomingReason, DeteriorationReason.highWaves);
    });

    test('Scenario 4: Known thunderstorm with missing numeric data preserves danger evidence', () {
      final hours = <HourlyInterval>[
        HourlyInterval(
          time: fixedNow.add(const Duration(hours: 1)),
          weatherCode: 95, // Thunderstorm in current hour
          gustKph: null,
          waveM: null,
        ),
      ];

      final outlook = makeOutlook(hours: hours);
      final result = FishingWindowCalculator.calculate(
        forecast: outlook,
        now: fixedNow,
      );

      expect(result.currentRisk, RiskLevel.danger);
      expect(result.currentReason, DeteriorationReason.thunderstorm);
      expect(result.hasPositiveWindow, isFalse);
    });

    test('Scenario 5: Missing weather code, gust or marine data stops safe certification', () {
      final hours = <HourlyInterval>[
        hour(hoursFromNow: 1),
        HourlyInterval(
          time: fixedNow.add(const Duration(hours: 2)),
          weatherCode: 1,
          gustKph: 12.0,
          waveM: null, // missing wave height
        ),
      ];

      final outlook = makeOutlook(hours: hours);
      final result = FishingWindowCalculator.calculate(
        forecast: outlook,
        now: fixedNow,
      );

      expect(result.hasPositiveWindow, isFalse);
      expect(result.availability, FishingWindowAvailability.incompleteData);
    });

    test('Scenario 6: Missing hourly interval before a future hazard shows hazard time without safe countdown', () {
      final hours = <HourlyInterval>[
        hour(hoursFromNow: 1),
        // Gap: hour 2 and 3 are missing!
        hour(hoursFromNow: 5, gust: 40.0), // Hazard at hour 5
      ];

      final outlook = makeOutlook(hours: hours);
      final result = FishingWindowCalculator.calculate(
        forecast: outlook,
        now: fixedNow,
      );

      expect(result.upcomingRisk, RiskLevel.caution);
      expect(result.upcomingReason, DeteriorationReason.strongWinds);
      expect(result.deteriorationTime, fixedNow.add(const Duration(hours: 4)));
      expect(result.durationUntilDeterioration, isNull);
      expect(result.hasPositiveWindow, isFalse);
      expect(result.availability, FishingWindowAvailability.earlierDataMissing);
    });

    test('Scenario 7: Gust maximum timestamp is the end of the preceding hour', () {
      // Interval at hoursFromNow: 3 covers [now + 2h, now + 3h]
      final hours = <HourlyInterval>[
        hour(hoursFromNow: 1),
        hour(hoursFromNow: 2),
        hour(hoursFromNow: 3, gust: 35.0),
      ];

      final outlook = makeOutlook(hours: hours);
      final result = FishingWindowCalculator.calculate(
        forecast: outlook,
        now: fixedNow,
      );

      // Deterioration begins at interval start: now + 2h, NOT now + 3h
      expect(result.deteriorationTime, fixedNow.add(const Duration(hours: 2)));
      expect(result.durationUntilDeterioration, const Duration(hours: 2));
    });

    test('Scenario 8: No threshold crossing in available near-term coverage shows coverage end', () {
      final hours = <HourlyInterval>[];
      for (int i = 1; i <= 48; i++) {
        hours.add(hour(hoursFromNow: i));
      }

      final outlook = makeOutlook(hours: hours);
      final result = FishingWindowCalculator.calculate(
        forecast: outlook,
        now: fixedNow,
      );

      expect(result.currentRisk, RiskLevel.safe);
      expect(result.upcomingRisk, isNull);
      expect(result.deteriorationTime, isNull);
      expect(result.availability, FishingWindowAvailability.noWorseningForecast);
      expect(result.coverageEnd, fixedNow.add(const Duration(hours: 48)));
    });

    test('Scenario 9: Daily-only server and failed hourly fallback reports missing hourly with first adverse day', () {
      final days = <DailyOutlook>[
        DailyOutlook(
          date: DateTime.parse('2026-08-16'),
          weatherCode: 1,
          risk: const RiskAssessment(level: RiskLevel.safe, source: RiskSource.backend),
        ),
        DailyOutlook(
          date: DateTime.parse('2026-08-17'),
          weatherCode: 95,
          risk: const RiskAssessment(level: RiskLevel.danger, source: RiskSource.backend),
        ),
      ];

      final outlook = makeOutlook(hours: const <HourlyInterval>[], days: days);
      final result = FishingWindowCalculator.calculate(
        forecast: outlook,
        now: fixedNow,
      );

      expect(result.availability, FishingWindowAvailability.missingHourly);
      expect(result.firstAdverseDay, DateTime.parse('2026-08-17'));
      expect(result.hasPositiveWindow, isFalse);
    });

    test('Scenario 10: Daily rain risk suppresses contradictory positive hourly time window', () {
      final days = <DailyOutlook>[
        DailyOutlook(
          date: DateTime.parse('2026-08-16'),
          weatherCode: 1,
          precipMm: 35.0, // Exceeds caution threshold (20mm)
          risk: const RiskAssessment(level: RiskLevel.caution, source: RiskSource.backend),
        ),
      ];

      final hours = <HourlyInterval>[
        hour(hoursFromNow: 1),
        hour(hoursFromNow: 2),
      ];

      final outlook = makeOutlook(hours: hours, days: days);
      final result = FishingWindowCalculator.calculate(
        forecast: outlook,
        now: fixedNow,
      );

      expect(result.currentRisk, RiskLevel.caution);
      expect(result.currentReason, DeteriorationReason.dailyRain);
      expect(result.hasPositiveWindow, isFalse);
    });

    test('Scenario 11: Stale refresh (> 30 min) shows staleRefreshNeeded without countdown', () {
      final hours = <HourlyInterval>[
        hour(hoursFromNow: 1),
        hour(hoursFromNow: 2),
        hour(hoursFromNow: 3),
        hour(hoursFromNow: 4),
        hour(hoursFromNow: 5, gust: 35.0),
      ];

      final outlook = makeOutlook(
        hours: hours,
        fetchedAt: fixedNow.subtract(const Duration(minutes: 35)),
      );

      final result = FishingWindowCalculator.calculate(
        forecast: outlook,
        now: fixedNow,
      );

      expect(result.availability, FishingWindowAvailability.staleRefreshNeeded);
      expect(result.hasPositiveWindow, isFalse);
      expect(result.upcomingRisk, RiskLevel.caution);
    });

    test('Scenario 12: Expired cache (> 12h) returns expired availability', () {
      final hours = <HourlyInterval>[hour(hoursFromNow: 1)];
      final outlook = makeOutlook(
        hours: hours,
        fetchedAt: fixedNow.subtract(const Duration(hours: 13)),
      );

      final result = FishingWindowCalculator.calculate(
        forecast: outlook,
        now: fixedNow,
      );

      expect(result.availability, FishingWindowAvailability.expired);
      expect(result.currentRisk, RiskLevel.unknown);
    });

    test('Scenario 13: Future timestamp beyond 1 min skew returns clockSkew', () {
      final hours = <HourlyInterval>[hour(hoursFromNow: 1)];
      final outlook = makeOutlook(
        hours: hours,
        fetchedAt: fixedNow.add(const Duration(minutes: 5)),
      );

      final result = FishingWindowCalculator.calculate(
        forecast: outlook,
        now: fixedNow,
      );

      expect(result.availability, FishingWindowAvailability.clockSkew);
      expect(result.currentRisk, RiskLevel.unknown);
    });

    test('Scenario 14: Official notAdvised and squall returnNow override forecast', () {
      final hours = <HourlyInterval>[
        hour(hoursFromNow: 1), // Forecast is green
        hour(hoursFromNow: 2),
      ];
      final outlook = makeOutlook(hours: hours);

      // Official notAdvised
      final officialCondition = SeaCondition(
        status: SeaStatus.notAdvised,
        reason: 'Typhoon alert',
        fetchedAt: fixedNow,
      );
      final res1 = FishingWindowCalculator.calculate(
        forecast: outlook,
        seaCondition: officialCondition,
        now: fixedNow,
      );
      expect(res1.currentRisk, RiskLevel.danger);
      expect(res1.currentReason, DeteriorationReason.officialDanger);
      expect(res1.hasPositiveWindow, isFalse);

      // Squall returnNow
      const squall = SquallWatch(
        level: SquallLevel.returnNow,
        returnNow: true,
        leadMinutes: 15,
      );
      final res2 = FishingWindowCalculator.calculate(
        forecast: outlook,
        squall: squall,
        now: fixedNow,
      );
      expect(res2.currentRisk, RiskLevel.danger);
      expect(res2.currentReason, DeteriorationReason.squallDanger);
      expect(res2.hasPositiveWindow, isFalse);
    });

    test('Scenario 15: Official caution and squall watch elevate current risk and prevent positive window', () {
      final hours = <HourlyInterval>[
        hour(hoursFromNow: 1),
        hour(hoursFromNow: 2),
      ];
      final outlook = makeOutlook(hours: hours);

      final officialCondition = SeaCondition(
        status: SeaStatus.caution,
        reason: 'Rough seas',
        fetchedAt: fixedNow,
      );
      final res = FishingWindowCalculator.calculate(
        forecast: outlook,
        seaCondition: officialCondition,
        now: fixedNow,
      );
      expect(res.currentRisk, RiskLevel.caution);
      expect(res.currentReason, DeteriorationReason.officialCaution);
      expect(res.hasPositiveWindow, isFalse);
      expect(res.availability, FishingWindowAvailability.currentCaution);
    });

    test('isUnderOneHour is true when window is under 60 minutes', () {
      final hour30m = HourlyInterval(
        time: fixedNow.add(const Duration(minutes: 90)), // 09:30
        gustKph: 35.0,
      );
      final currentHour = HourlyInterval(
        time: fixedNow.add(const Duration(minutes: 30)), // 08:30 (covers 07:30-08:30)
        gustKph: 10.0,
        waveM: 0.5,
        weatherCode: 1,
      );

      final outlook = makeOutlook(hours: <HourlyInterval>[currentHour, hour30m]);
      final result = FishingWindowCalculator.calculate(
        forecast: outlook,
        now: fixedNow,
      );

      expect(result.hasPositiveWindow, isTrue);
      expect(result.durationUntilDeterioration, const Duration(minutes: 30));
      expect(result.isUnderOneHour, isTrue);
      expect(result.windowDays, 0);
      expect(result.windowHours, 0);
    });
  });
}
