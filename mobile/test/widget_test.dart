import 'package:aqone/models/buoy_contact.dart';
import 'package:aqone/models/delivery_state.dart';
import 'package:aqone/models/sos_record.dart';
import 'package:aqone/ui/widgets/buoy_status_card.dart';
import 'package:aqone/ui/widgets/delivery_state_tile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _host(Widget child) {
  return MaterialApp(
    home: Scaffold(body: SingleChildScrollView(child: child)),
  );
}

BuoyStatus _status({
  MeshHealth mesh = MeshHealth.ok,
  int battery = 86,
  int queued = 0,
}) {
  return BuoyStatus(
    buoyId: 1001,
    battery: battery,
    mesh: mesh,
    queued: queued,
    observedAt: DateTime.utc(2026, 8, 4, 9, 15),
  );
}

SosRecord _record({
  DeliveryState state = DeliveryState.relayed,
  double? lat,
  double? lon,
  int? seq,
  String? ackedBy,
}) {
  return SosRecord(
    localId: 'local-1',
    vesselId: '0123456789abcdef0123456789abcdef',
    boat: 'BG-123',
    clientTs: 1722700000,
    state: state,
    lat: lat,
    lon: lon,
    seq: seq,
    buoyId: seq == null ? null : 1001,
    ackedBy: ackedBy,
  );
}

void main() {
  group('BuoyStatusCard', () {
    testWidgets('reports no buoy when there is no status', (tester) async {
      await tester.pumpWidget(_host(const BuoyStatusCard(status: null)));

      expect(find.text('No buoy connected'), findsOneWidget);
      expect(
        find.text('Join a buoy WiFi network to hand off an SOS.'),
        findsOneWidget,
      );
    });

    testWidgets('shows buoy id, battery and mesh state when connected',
        (tester) async {
      await tester.pumpWidget(_host(BuoyStatusCard(status: _status())));

      expect(find.text('Buoy 1001'), findsOneWidget);
      expect(find.text('86%'), findsOneWidget);
      expect(find.text(MeshHealth.ok.description), findsOneWidget);
    });

    testWidgets('surfaces a degraded mesh and queue depth', (tester) async {
      await tester.pumpWidget(
        _host(
          BuoyStatusCard(status: _status(mesh: MeshHealth.degraded, queued: 3)),
        ),
      );

      expect(find.text(MeshHealth.degraded.description), findsOneWidget);
      expect(find.text('3 message(s) waiting on this buoy'), findsOneWidget);
    });

    testWidgets('hides battery when the buoy reports an unknown value',
        (tester) async {
      await tester.pumpWidget(
        _host(BuoyStatusCard(status: _status(battery: -1))),
      );

      expect(find.textContaining('%'), findsNothing);
    });
  });

  group('DeliveryStateTile', () {
    testWidgets('renders the documented sentence for every state',
        (tester) async {
      for (final state in DeliveryState.values) {
        await tester.pumpWidget(
          _host(DeliveryStateTile(record: _record(state: state))),
        );

        expect(find.text(state.title), findsOneWidget);
        expect(find.text(state.description), findsOneWidget);
      }
    });

    testWidgets('states there is no fix rather than showing a fake position',
        (tester) async {
      await tester.pumpWidget(_host(DeliveryStateTile(record: _record())));

      expect(find.text('No GPS fix recorded'), findsOneWidget);
    });

    testWidgets('shows coordinates and the buoy hop when present',
        (tester) async {
      await tester.pumpWidget(
        _host(
          DeliveryStateTile(
            record: _record(lat: 11.6050, lon: 122.3125, seq: 42),
          ),
        ),
      );

      expect(find.text('11.60500, 122.31250'), findsOneWidget);
      expect(find.text('buoy 1001 · seq 42'), findsOneWidget);
    });

    testWidgets('names the responder once acknowledged', (tester) async {
      await tester.pumpWidget(
        _host(
          DeliveryStateTile(
            record: _record(
              state: DeliveryState.acknowledged,
              ackedBy: 'ranger-01',
            ),
          ),
        ),
      );

      expect(find.text('ranger-01'), findsOneWidget);
      expect(find.text('Responder acknowledged this SOS.'), findsOneWidget);
    });
  });
}
