import 'package:aqone/models/squall_watch.dart';
import 'package:aqone/ui/squall_alert_page.dart';
import 'package:flutter/material.dart';
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
}
