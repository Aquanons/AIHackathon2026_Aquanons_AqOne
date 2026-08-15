import 'package:sqflite/sqflite.dart';

import '../models/fishing_spot.dart';
import 'app_database.dart';

/// Local queue of fishing-spot reports. Mirrors [CatchStore] in shape.
class FishingSpotStore {
  FishingSpotStore(this._db);

  final AppDatabase _db;

  static const String _table = 'fishing_spot_outbox';

  Future<void> insert(FishingSpot spot) async {
    final db = await _db.database;
    await db.insert(
      _table,
      spot.toRow(),
      conflictAlgorithm: ConflictAlgorithm.abort,
    );
  }

  Future<List<FishingSpot>> all({int limit = 100}) async {
    final db = await _db.database;
    final rows = await db.query(
      _table,
      orderBy: 'client_ts DESC',
      limit: limit,
    );
    return rows.map(FishingSpot.fromRow).toList(growable: false);
  }

  Future<FishingSpot?> byLocalId(String localId) async {
    final db = await _db.database;
    final rows = await db.query(
      _table,
      where: 'local_id = ?',
      whereArgs: <Object?>[localId],
      limit: 1,
    );
    return rows.isEmpty ? null : FishingSpot.fromRow(rows.first);
  }

  Future<List<FishingSpot>> awaitingSync() async {
    final db = await _db.database;
    final rows = await db.query(
      _table,
      where: 'state = ?',
      whereArgs: <Object?>[SpotSyncState.pending.wire],
      orderBy: 'client_ts ASC',
    );
    return rows.map(FishingSpot.fromRow).toList(growable: false);
  }

  Future<int> pendingCount() async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      'SELECT COUNT(*) AS c FROM $_table WHERE state = ?',
      <Object?>[SpotSyncState.pending.wire],
    );
    return (rows.first['c'] as num?)?.toInt() ?? 0;
  }

  Future<FishingSpot> save(FishingSpot spot) async {
    final db = await _db.database;
    await db.update(
      _table,
      spot.toRow(),
      where: 'local_id = ?',
      whereArgs: <Object?>[spot.localId],
    );
    return spot;
  }

  Future<FishingSpot?> markSynced(String localId, {String? serverId}) async {
    final current = await byLocalId(localId);
    if (current == null) {
      return null;
    }
    return save(
      current.copyWith(
        state: SpotSyncState.synced,
        serverId: serverId,
        syncedAt: DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000,
        clearError: true,
      ),
    );
  }

  /// A transport failure. The record stays pending so it is retried.
  Future<FishingSpot?> recordFailure(String localId, String error) async {
    final current = await byLocalId(localId);
    if (current == null) {
      return null;
    }
    return save(
      current.copyWith(attempts: current.attempts + 1, lastError: error),
    );
  }

  /// The server refused this entry on its merits. Retrying will not help, so
  /// it stops consuming attempts and is surfaced to the user instead.
  Future<FishingSpot?> markRejected(String localId, String reason) async {
    final current = await byLocalId(localId);
    if (current == null) {
      return null;
    }
    return save(
      current.copyWith(
        state: SpotSyncState.rejected,
        attempts: current.attempts + 1,
        lastError: reason,
      ),
    );
  }
}
