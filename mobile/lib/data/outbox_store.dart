import 'package:sqflite/sqflite.dart';

import '../models/delivery_state.dart';
import '../models/sos_record.dart';
import 'app_database.dart';

class OutboxStore {
  OutboxStore(this._db);

  final AppDatabase _db;

  Future<void> insert(SosRecord record) async {
    final db = await _db.database;
    await db.insert(
      'outbox',
      record.toRow(),
      conflictAlgorithm: ConflictAlgorithm.abort,
    );
  }

  Future<List<SosRecord>> all({int limit = 100}) async {
    final db = await _db.database;
    final rows = await db.query(
      'outbox',
      orderBy: 'client_ts DESC',
      limit: limit,
    );
    return rows.map(SosRecord.fromRow).toList(growable: false);
  }

  Future<SosRecord?> byLocalId(String localId) async {
    final db = await _db.database;
    final rows = await db.query(
      'outbox',
      where: 'local_id = ?',
      whereArgs: <Object?>[localId],
      limit: 1,
    );
    return rows.isEmpty ? null : SosRecord.fromRow(rows.first);
  }

  Future<List<SosRecord>> awaitingRelay() async {
    final db = await _db.database;
    final rows = await db.query(
      'outbox',
      where: 'state = ?',
      whereArgs: <Object?>[DeliveryState.saved.wire],
      orderBy: 'client_ts ASC',
    );
    return rows.map(SosRecord.fromRow).toList(growable: false);
  }

  Future<List<SosRecord>> awaitingReconcile() async {
    final db = await _db.database;
    final rows = await db.query(
      'outbox',
      where: 'state IN (?, ?)',
      whereArgs: <Object?>[
        DeliveryState.relayed.wire,
        DeliveryState.delivered.wire,
      ],
      orderBy: 'client_ts ASC',
    );
    return rows.map(SosRecord.fromRow).toList(growable: false);
  }

  Future<SosRecord> save(SosRecord record) async {
    final db = await _db.database;
    await db.update(
      'outbox',
      record.toRow(),
      where: 'local_id = ?',
      whereArgs: <Object?>[record.localId],
    );
    return record;
  }

  Future<SosRecord?> advance(
    String localId,
    DeliveryState candidate, {
    String? buoyId,
    int? srcId,
    int? seq,
    int? serverTs,
    String? ackedBy,
  }) async {
    final current = await byLocalId(localId);
    if (current == null) {
      return null;
    }

    final next = current.state.merge(candidate);
    if (next == current.state &&
        buoyId == null &&
        srcId == null &&
        seq == null &&
        ackedBy == null) {
      return current;
    }

    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    final updated = current.copyWith(
      state: next,
      buoyId: buoyId,
      srcId: srcId,
      seq: seq,
      serverTs: serverTs,
      ackedBy: ackedBy,
      lastError: null,
      relayedAt: next.rank >= DeliveryState.relayed.rank
          ? (current.relayedAt ?? now)
          : current.relayedAt,
      deliveredAt: next.rank >= DeliveryState.delivered.rank
          ? (current.deliveredAt ?? now)
          : current.deliveredAt,
      acknowledgedAt: next.rank >= DeliveryState.acknowledged.rank
          ? (current.acknowledgedAt ?? now)
          : current.acknowledgedAt,
    );
    return save(updated);
  }

  /// Store what the responder sent back for this SOS.
  ///
  /// Returns true when something actually changed, so the caller only pushes a
  /// UI update when there is news - a poll every 15 seconds that reports "no
  /// change" should not repaint a countdown the user is watching.
  Future<bool> saveResponder(
    String localId, {
    String? remoteId,
    String? etaAt,
    int? responderStatus,
    String? responderNote,
  }) async {
    final db = await _db.database;
    final existing = await db.query(
      'outbox',
      columns: <String>['remote_id', 'eta_at', 'responder_status', 'responder_note'],
      where: 'local_id = ?',
      whereArgs: <Object?>[localId],
      limit: 1,
    );
    if (existing.isEmpty) {
      return false;
    }
    final row = existing.first;

    final next = <String, Object?>{
      if (remoteId != null && row['remote_id'] != remoteId) 'remote_id': remoteId,
      if (etaAt != null && row['eta_at'] != etaAt) 'eta_at': etaAt,
      if (responderStatus != null && row['responder_status'] != responderStatus)
        'responder_status': responderStatus,
      if (responderNote != null && row['responder_note'] != responderNote)
        'responder_note': responderNote,
    };
    if (next.isEmpty) {
      return false;
    }

    await db.update(
      'outbox',
      next,
      where: 'local_id = ?',
      whereArgs: <Object?>[localId],
    );
    return true;
  }

  /// Record the fisher's own reply locally, so the button reflects reality even
  /// if the network call to the backend fails.
  Future<void> saveFisherReply(String localId, int reply) async {
    final db = await _db.database;
    await db.update(
      'outbox',
      <String, Object?>{'fisher_reply': reply},
      where: 'local_id = ?',
      whereArgs: <Object?>[localId],
    );
  }

  Future<SosRecord?> recordFailure(String localId, String error) async {
    final current = await byLocalId(localId);
    if (current == null) {
      return null;
    }
    return save(
      current.copyWith(attempts: current.attempts + 1, lastError: error),
    );
  }
}
