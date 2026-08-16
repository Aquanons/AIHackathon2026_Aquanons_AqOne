import 'package:aqone/l10n/app_localizations.dart';
import 'package:aqone/models/delivery_state.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DeliveryState', () {
    test('wire values match docs/06_DELIVERY_STATES.md', () {
      expect(
        DeliveryState.values.map((state) => state.wire).toList(),
        <String>['saved', 'relayed', 'delivered', 'acknowledged'],
      );
    });

    test('English descriptions match the documented display conventions',
        () async {
      final t = await AppLocalizations.delegate.load(const Locale('en'));
      expect(
        DeliveryState.saved.description(t),
        'Not sent — no buoy nearby. Will send automatically.',
      );
      expect(
        DeliveryState.relayed.description(t),
        'Handed to the buoy. Waiting for the mesh.',
      );
      expect(
        DeliveryState.delivered.description(t),
        'Received by the MDRRMO dashboard.',
      );
      expect(
        DeliveryState.acknowledged.description(t),
        'Responder acknowledged this SOS.',
      );
    });

    // Guards the failure that matters most in translation: a locale that
    // silently falls back to English, or two states that end up sharing a
    // label. A skipper who cannot tell Relayed from Delivered has lost the
    // one guarantee this app makes.
    test('every locale gives all four states distinct, non-English text',
        () async {
      for (final code in <String>['fil', 'akl']) {
        final t = await AppLocalizations.delegate.load(Locale(code));
        final en = await AppLocalizations.delegate.load(const Locale('en'));

        final titles =
            DeliveryState.values.map((s) => s.title(t)).toSet();
        expect(titles.length, 4, reason: '$code has duplicate state titles');

        for (final state in DeliveryState.values) {
          expect(
            state.description(t),
            isNot(state.description(en)),
            reason: '$code ${state.wire} description is untranslated',
          );
        }
      }
    });

    test('merge never regresses a state', () {
      expect(
        DeliveryState.delivered.merge(DeliveryState.saved),
        DeliveryState.delivered,
      );
      expect(
        DeliveryState.acknowledged.merge(DeliveryState.relayed),
        DeliveryState.acknowledged,
      );
    });

    test('merge advances forward', () {
      expect(
        DeliveryState.saved.merge(DeliveryState.relayed),
        DeliveryState.relayed,
      );
      expect(
        DeliveryState.relayed.merge(DeliveryState.acknowledged),
        DeliveryState.acknowledged,
      );
    });

    test('unknown wire values fall back to saved', () {
      expect(DeliveryState.fromWire('nonsense'), DeliveryState.saved);
      expect(DeliveryState.fromWire(null), DeliveryState.saved);
    });
  });
}
