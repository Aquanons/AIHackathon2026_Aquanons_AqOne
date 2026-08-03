import 'package:aqone/models/delivery_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DeliveryState', () {
    test('wire values match docs/06_DELIVERY_STATES.md', () {
      expect(
        DeliveryState.values.map((state) => state.wire).toList(),
        <String>['saved', 'relayed', 'delivered', 'acknowledged'],
      );
    });

    test('descriptions match the documented display conventions', () {
      expect(
        DeliveryState.saved.description,
        'Not sent — no buoy nearby. Will send automatically.',
      );
      expect(
        DeliveryState.relayed.description,
        'Handed to the buoy. Waiting for the mesh.',
      );
      expect(
        DeliveryState.delivered.description,
        'Received by the MDRRMO dashboard.',
      );
      expect(
        DeliveryState.acknowledged.description,
        'Responder acknowledged this SOS.',
      );
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
