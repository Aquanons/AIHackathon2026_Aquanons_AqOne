import 'package:sqflite/sqflite.dart';

import '../models/catch_record.dart';
import 'app_database.dart';

/// Local queue of catch logs.
///
/// Mirrors [OutboxStore] in shape so the two feel the same to work with, but
/// the lifecycle is simpler: a catch is either waiting to upload, uploaded,
/// or rejected. There is no buoy hop and no responder acknowledgement.
class CatchStore {
  CatchStore(this._db);

  final AppDatabase _db;

  static const String _table = 'catch_outbox';

  Future<void> insert(CatchRecord record) async {
    final db = await _db.database;
    await db.insert(
      _table,
      record.toRow(),
      conflictAlgorithm: ConflictAlgorithm.abort,
    );
  }

  Future<List<CatchRecord>> all({int limit = 100}) async {
    final db = await _db.database;
    final rows = await db.query(
      _table,
      orderBy: 'client_ts DESC',
      limit: limit,
    );
    return rows.map(CatchRecord.fromRow).toList(growable: false);
  }

  Future<CatchRecord?> byLocalId(String localId) async {
    final db = await _db.database;
    final rows = await db.query(
      _table,
      where: 'local_id = ?',
      whereArgs: <Object?>[localId],
      limit: 1,
    );
    return rows.isEmpty ? null : CatchRecord.fromRow(rows.first);
  }

  Future<List<CatchRecord>> awaitingSync() async {
    final db = await _db.database;
    final rows = await db.query(
      _table,
      where: 'state = ?',
      whereArgs: <Object?>[SyncState.pending.wire],
      orderBy: 'client_ts ASC',
    );
    return rows.map(CatchRecord.fromRow).toList(growable: false);
  }

  Future<int> pendingCount() async {
    final db = await _db.database;
    final rows = await db.rawQuery(
      'SELECT COUNT(*) AS c FROM $_table WHERE state = ?',
      <Object?>[SyncState.pending.wire],
    );
    return (rows.first['c'] as num?)?.toInt() ?? 0;
  }

  /// Today's catches, newest first - what the history/confirm-weight screen
  /// shows. Scoped to the calendar date rather than a row count, since "what
  /// did I log today" is the question a fisherman actually has.
  Future<List<CatchRecord>> today(String isoDate) async {
    final db = await _db.database;
    final rows = await db.query(
      _table,
      where: 'catch_date = ?',
      whereArgs: <Object?>[isoDate],
      orderBy: 'client_ts DESC',
    );
    return rows.map(CatchRecord.fromRow).toList(growable: false);
  }

  /// Confirmations made on this handset that have not yet reached the
  /// backend - queued because the initial upload had not produced a server
  /// id yet, or because there was no signal at the moment of confirming.
  Future<List<CatchRecord>> awaitingWeightSync() async {
    final db = await _db.database;
    final rows = await db.query(
      _table,
      where: 'quantity_confirmed_at IS NOT NULL '
          'AND quantity_synced_at IS NULL '
          'AND server_id IS NOT NULL',
      orderBy: 'quantity_confirmed_at ASC',
    );
    return rows.map(CatchRecord.fromRow).toList(growable: false);
  }

  Future<CatchRecord> save(CatchRecord record) async {
    final db = await _db.database;
    await db.update(
      _table,
      record.toRow(),
      where: 'local_id = ?',
      whereArgs: <Object?>[record.localId],
    );
    return record;
  }

  Future<CatchRecord?> markSynced(String localId, {String? serverId}) async {
    final current = await byLocalId(localId);
    if (current == null) {
      return null;
    }
    return save(
      current.copyWith(
        state: SyncState.synced,
        serverId: serverId,
        syncedAt: DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000,
        clearError: true,
      ),
    );
  }

  /// A transport failure. The record stays pending so it is retried.
  Future<CatchRecord?> recordFailure(String localId, String error) async {
    final current = await byLocalId(localId);
    if (current == null) {
      return null;
    }
    return save(
      current.copyWith(attempts: current.attempts + 1, lastError: error),
    );
  }

  /// The fisherman reweighed the catch and confirmed a real figure.
  ///
  /// Local-first, same as everything else here: this always succeeds on the
  /// phone immediately. Whether it has reached the backend is a separate
  /// question, answered by [awaitingWeightSync] / [markWeightSynced].
  Future<CatchRecord?> confirmWeight(String localId, double quantityKg) async {
    final current = await byLocalId(localId);
    if (current == null) {
      return null;
    }
    return save(
      current.copyWith(
        quantityKg: quantityKg,
        quantityConfirmedAt: DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000,
      ),
    );
  }

  Future<CatchRecord?> markWeightSynced(String localId) async {
    final current = await byLocalId(localId);
    if (current == null) {
      return null;
    }
    return save(
      current.copyWith(
        quantitySyncedAt: DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000,
      ),
    );
  }

  /// The server refused this entry on its merits. Retrying will not help, so
  /// it stops consuming attempts and is surfaced to the user instead.
  Future<CatchRecord?> markRejected(String localId, String reason) async {
    final current = await byLocalId(localId);
    if (current == null) {
      return null;
    }
    return save(
      current.copyWith(
        state: SyncState.rejected,
        attempts: current.attempts + 1,
        lastError: reason,
      ),
    );
  }
}
