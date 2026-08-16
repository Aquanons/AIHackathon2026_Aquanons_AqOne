import 'package:aqone/core/l10n_fallback.dart';
import 'package:aqone/models/daily_outlook.dart';
import 'package:aqone/models/weather_snapshot.dart';
import 'package:aqone/ui/widgets/weather_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  List<DailyOutlook> sevenDays() {
    final DateTime start = DateTime.now();
    return List<DailyOutlook>.generate(7, (int i) {
      return DailyOutlook(
        date: DateTime(start.year, start.month, start.day).add(
          Duration(days: i),
        ),
        // Day 3 is the stormy one, so the icon assertion is meaningful.
        weatherCode: i == 3 ? 95 : 0,
        tempMax: 30 + i,
        tempMin: 24,
        gustKph: i == 3 ? 55 : 10,
        waveM: i == 3 ? 2.9 : 0.5,
        risk: RiskAssessment(
          level: i == 3 ? RiskLevel.danger : RiskLevel.safe,
          source: RiskSource.device,
          reason: i == 3 ? 'Gusts 55 km/h and 2.9 m swell' : 'Calm',
          inputs: const <String>['open-meteo', 'wave'],
        ),
      );
    });
  }

  /// The card resolves its own strings now, so the harness has to supply the
  /// delegates or every build throws on AppLocalizations.of.
  Widget wrap(Widget child, {Locale locale = const Locale('en')}) {
    return MaterialApp(
      locale: locale,
      supportedLocales: kSupportedLocales,
      localizationsDelegates: <LocalizationsDelegate<dynamic>>[
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        ...kFallbackDelegates,
      ],
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );
  }

  testWidgets('renders one chip per forecast day', (WidgetTester tester) async {
    await tester.pumpWidget(
      wrap(
        WeatherCard(
          snapshot: const WeatherSnapshot(
            temperature: 30,
            windSpeed: 8,
            weatherCode: 0,
          ),
          isLoading: false,
          onRetry: () {},
          forecast: sevenDays(),
        ),
      ),
    );

    expect(find.text('7-day outlook'), findsOneWidget);
    expect(find.text('Today'), findsOneWidget);
    // Today plus six named weekdays.
    expect(find.byIcon(Icons.check_circle_rounded), findsNWidgets(6));
    expect(find.byIcon(Icons.dangerous_rounded), findsOneWidget);
    expect(find.byIcon(Icons.thunderstorm_rounded), findsOneWidget);
  });

  testWidgets('says so when sea state was not available', (
    WidgetTester tester,
  ) async {
    final List<DailyOutlook> noWaves = sevenDays()
        .map(
          (DailyOutlook d) => DailyOutlook(
            date: d.date,
            weatherCode: d.weatherCode,
            tempMax: d.tempMax,
            risk: RiskAssessment(
              level: d.risk.level,
              source: RiskSource.device,
              inputs: const <String>['open-meteo'],
            ),
          ),
        )
        .toList(growable: false);

    await tester.pumpWidget(
      wrap(
        WeatherCard(
          snapshot: const WeatherSnapshot(
            temperature: 30,
            windSpeed: 8,
            weatherCode: 0,
          ),
          isLoading: false,
          onRetry: () {},
          forecast: noWaves,
        ),
      ),
    );

    expect(
      find.textContaining('sea state not available'),
      findsOneWidget,
    );
  });

  testWidgets('stamps a cached strip with when it was fetched', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      wrap(
        WeatherCard(
          snapshot: null,
          isLoading: false,
          onRetry: () {},
          forecast: sevenDays(),
          forecastAge: DateTime(2026, 8, 16, 6, 12),
        ),
      ),
    );

    expect(find.text('as of 6:12 AM'), findsOneWidget);
    // No live current-conditions reading, so the retry affordance still shows.
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('builds in Aklanon without throwing', (
    WidgetTester tester,
  ) async {
    // akl has no CLDR data, so this is the locale that breaks first if the
    // fallback delegates are ever dropped or reordered. The strip carries
    // safety-relevant labels, so it must not be the thing that crashes.
    await tester.pumpWidget(
      wrap(
        WeatherCard(
          snapshot: const WeatherSnapshot(
            temperature: 30,
            windSpeed: 8,
            weatherCode: 0,
          ),
          isLoading: false,
          onRetry: () {},
          forecast: sevenDays(),
        ),
        locale: const Locale('akl'),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(find.byIcon(Icons.dangerous_rounded), findsOneWidget);
  });

  testWidgets('omits the strip entirely when there is no forecast', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      wrap(
        WeatherCard(
          snapshot: const WeatherSnapshot(
            temperature: 30,
            windSpeed: 8,
            weatherCode: 0,
          ),
          isLoading: false,
          onRetry: () {},
        ),
      ),
    );

    expect(find.text('7-day outlook'), findsNothing);
  });
}
