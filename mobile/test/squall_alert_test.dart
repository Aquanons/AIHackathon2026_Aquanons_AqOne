import 'package:aqone/core/l10n_fallback.dart';
import 'package:aqone/l10n/app_localizations.dart';
import 'package:aqone/models/squall_watch.dart';
import 'package:aqone/ui/squall_alert_page.dart';
import 'package:aqone/ui/widgets/squall_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget wrap(SquallWatch watch, {VoidCallback? onAcknowledge}) {
    return MaterialApp(
      home: SquallAlertPage(
        watch: watch,
        onAcknowledge: onAcknowledge ?? () {},
      ),
    );
  }

  const SquallWatch returnNow = SquallWatch(
    level: SquallLevel.returnNow,
    returnNow: true,
    leadMinutes: 20,
    triggeredBuoys: <String>['buoy-a', 'buoy-b'],
  );

  testWidgets('leads with the instruction and the time available', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(wrap(returnNow));

    expect(find.text('RETURN NOW'), findsOneWidget);
    expect(find.textContaining('20 minutes'), findsOneWidget);
    expect(find.text('Head for shore.'), findsOneWidget);
    expect(find.textContaining('buoy-a, buoy-b'), findsOneWidget);
  });

  testWidgets('still works when the model gives no lead time', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      wrap(const SquallWatch(level: SquallLevel.returnNow, returnNow: true)),
    );

    expect(find.text('RETURN NOW'), findsOneWidget);
    // No invented number, and no dangling "in about  minutes".
    expect(find.textContaining('minutes'), findsNothing);
  });

  testWidgets('cannot be dismissed by the back button', (
    WidgetTester tester,
  ) async {
    bool acknowledged = false;
    await tester.pumpWidget(
      wrap(returnNow, onAcknowledge: () => acknowledged = true),
    );

    // A warning dismissed by a stray gesture on a wet deck is a warning that
    // never happened.
    final NavigatorState nav = tester.state(find.byType(Navigator));
    nav.maybePop();
    await tester.pumpAndSettle();

    expect(find.text('RETURN NOW'), findsOneWidget);
    expect(acknowledged, isFalse);
  });

  testWidgets('the acknowledge button is the only way out', (
    WidgetTester tester,
  ) async {
    bool acknowledged = false;
    await tester.pumpWidget(
      wrap(returnNow, onAcknowledge: () => acknowledged = true),
    );

    await tester.tap(find.text("I'm heading back"));
    await tester.pump();

    expect(acknowledged, isTrue);
  });

  testWidgets('surfaces that the model is calibrated on simulated data', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      wrap(
        const SquallWatch(
          level: SquallLevel.returnNow,
          returnNow: true,
          leadMinutes: 15,
          calibration: 'synthetic',
        ),
      ),
    );

    expect(find.textContaining('simulated'), findsOneWidget);
  });

  testWidgets('says nothing about calibration once the model is real', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(wrap(returnNow));
    expect(find.textContaining('simulated'), findsNothing);
  });

  group('SquallWatch.tryParse - stale data', () {
    test('a stale backend reading parses to unknown/no-alarm, never return_now', () {
      final SquallWatch? watch = SquallWatch.tryParse(<String, Object?>{
        'level': 'unknown',
        'return_now': false,
        'as_of': '2026-08-16T02:00:00Z',
        'calibration': 'synthetic',
        'stale': true,
        'stale_reason': 'latest synthetic reading is 6:00:00 old, past the '
            '3:00:00 freshness window for this nowcast',
      });

      expect(watch, isNotNull);
      expect(watch!.level, SquallLevel.unknown);
      expect(watch.returnNow, isFalse);
      expect(watch.stale, isTrue);
      expect(watch.staleReason, contains('freshness window'));
      // shouldDisplay is true for stale (there is something worth telling the
      // fisher) but the level guarantees no alarm-styled rendering happens.
      expect(watch.shouldDisplay, isTrue);
    });

    test('a malicious/malformed stale+return_now combination still cannot alarm', () {
      // The server's own boolean is never trusted alone - level must agree.
      // A payload claiming both stale and return_now is nonsensical, and the
      // existing level/return_now cross-check must still win.
      final SquallWatch? watch = SquallWatch.tryParse(<String, Object?>{
        'level': 'unknown',
        'return_now': true,
        'stale': true,
      });

      expect(watch!.returnNow, isFalse);
    });

    test('a normal unavailable/no-fetch state is not flagged stale', () {
      expect(SquallWatch.unavailable.stale, isFalse);
      expect(SquallWatch.unavailable.shouldDisplay, isFalse);
    });
  });

  group('SquallBanner - stale state', () {
    Widget wrapBanner(Widget child, {Locale locale = const Locale('en')}) {
      return MaterialApp(
        locale: locale,
        supportedLocales: kSupportedLocales,
        localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
          ...kFallbackDelegates,
        ],
        home: Scaffold(body: SingleChildScrollView(child: child)),
      );
    }

    const SquallWatch staleWithAge = SquallWatch(
      level: SquallLevel.unknown,
      returnNow: false,
      stale: true,
      asOf: null,
    );

    for (final Locale locale in kSupportedLocales) {
      testWidgets(
        'shows a neutral stale notice in ${locale.languageCode}, never the alarm styling',
        (WidgetTester tester) async {
          await tester.pumpWidget(
            wrapBanner(const SquallBanner(watch: staleWithAge), locale: locale),
          );
          await tester.pumpAndSettle();

          final AppLocalizations t = lookupAppLocalizations(locale);
          expect(find.text(t.squallStaleTitle), findsOneWidget);
          expect(find.text('RETURN NOW'), findsNothing);
          expect(find.text('Squall watch'), findsNothing);
          // No layout overflow, including the longer Filipino/Aklanon copy.
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets('renders nothing for a plain unavailable/unknown state', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        wrapBanner(const SquallBanner(watch: SquallWatch.unavailable)),
      );

      expect(find.byType(SquallBanner), findsOneWidget);
      expect(find.text('RETURN NOW'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });
}
