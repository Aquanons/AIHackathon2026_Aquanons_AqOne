import 'package:aqone/data/map_snapshot_store.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('snapshot expiry', () {
    test('hazard feeds expire far sooner than the rest', () {
      // A stale buoy position is harmless: moorings do not move. A stale wave
      // warning describes a sea that no longer exists, so it must not be
      // served for anything like as long.
      expect(
        MapSnapshotStore.maxAgeFor(MapSnapshotStore.feedWaveAlerts),
        MapSnapshotStore.hazardMaxAge,
      );
      expect(
        MapSnapshotStore.maxAgeFor(MapSnapshotStore.feedCapsizeAlerts),
        MapSnapshotStore.hazardMaxAge,
      );
      expect(
        MapSnapshotStore.maxAgeFor(MapSnapshotStore.feedSeaCondition),
        MapSnapshotStore.hazardMaxAge,
      );
      expect(
        MapSnapshotStore.maxAgeFor(MapSnapshotStore.feedBuoys),
        MapSnapshotStore.defaultMaxAge,
      );
      expect(
        MapSnapshotStore.maxAgeFor(MapSnapshotStore.feedHotspots),
        MapSnapshotStore.defaultMaxAge,
      );
    });

    test('an unknown feed key gets the conservative default, not forever', () {
      expect(
        MapSnapshotStore.maxAgeFor('something_added_later'),
        MapSnapshotStore.defaultMaxAge,
      );
    });

    test('hazard window is short enough to be about now', () {
      // Six hours is already generous for a nowcast. If this ever grows past
      // a working day, the feature has stopped being a safety aid.
      expect(MapSnapshotStore.hazardMaxAge.inHours, lessThanOrEqualTo(12));
      expect(
        MapSnapshotStore.defaultMaxAge,
        greaterThan(MapSnapshotStore.hazardMaxAge),
      );
    });
  });

  group('MapSnapshot', () {
    test('reports its own age', () {
      final MapSnapshot snapshot = MapSnapshot(
        payload: '{"buoys":[]}',
        fetchedAt: DateTime.now().subtract(const Duration(hours: 2)),
      );
      expect(snapshot.age.inHours, 2);
      expect(snapshot.payload, contains('buoys'));
    });
  });
}
