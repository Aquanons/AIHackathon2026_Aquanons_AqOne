import 'package:aqone/models/catch_record.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('heatmap sharing is opt-in and survives storage and upload', () {
    const record = CatchRecord(
      localId: 'catch-1',
      vesselId: 'vessel-1',
      speciesName: 'Bangus',
      estimatedQuantityKg: 2,
      catchDate: '2026-08-22',
      clientTs: 1,
      state: SyncState.pending,
      shareForHotspots: true,
      lat: 11.69,
      lon: 122.43,
    );

    expect(record.toBackendPayload()['share_for_hotspots'], isTrue);
    expect(record.toRow()['share_for_hotspots'], 1);
    expect(CatchRecord.fromRow(record.toRow()).shareForHotspots, isTrue);
  });

  test('heatmap sharing defaults to off', () {
    const record = CatchRecord(
      localId: 'catch-2',
      vesselId: 'vessel-1',
      speciesName: null,
      estimatedQuantityKg: 1,
      catchDate: '2026-08-22',
      clientTs: 2,
      state: SyncState.pending,
    );

    expect(record.shareForHotspots, isFalse);
    expect(record.toBackendPayload()['share_for_hotspots'], isFalse);
  });
}
