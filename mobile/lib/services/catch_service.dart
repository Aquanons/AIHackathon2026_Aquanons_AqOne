import 'dart:async';
import 'dart:math';

import '../core/config.dart';
import '../data/catch_store.dart';
import '../data/identity_store.dart';
import '../models/catch_record.dart';
import 'backend_client.dart';
import 'location_service.dart';

/// Queues catch logs locally and uploads them when the phone has signal.
///
/// A catch logged out of range must never simply be lost, and fishermen log
/// catches at sea, which is exactly where there is no signal - so the write
/// is queued first and uploaded later, the same offline-first shape as the
/// SOS outbox but over plain HTTP instead of the buoy mesh.
class CatchService {
  CatchService({
    required CatchStore store,
    required IdentityStore identity,
    required BackendClient backend,
    required LocationService location,
  })  : _store = store,
        _identity = identity,
        _backend = backend,
        _location = location;

  final CatchStore _store;
  final IdentityStore _identity;
  final BackendClient _backend;
  final LocationService _location;

  final StreamController<void> _changes = StreamController<void>.broadcast();
  Stream<void> get changes => _changes.stream;

  Timer? _syncTimer;
  bool _syncRunning = false;

  void start() {
    _syncTimer ??= Timer.periodic(
      AqOneConfig.outboxRetryInterval,
      (_) => syncPending(),
    );
  }

  void dispose() {
    _syncTimer?.cancel();
    _syncTimer = null;
    _changes.close();
  }

  Future<List<CatchRecord>> history() => _store.all();

  Future<List<CatchRecord>> today() =>
      _store.today(_isoDate(DateTime.now().toUtc()));

  Future<int> pendingCount() => _store.pendingCount();

  /// The most recently logged catch, if any - what "repeat last catch"
  /// re-sends without opening the sheet at all.
  Future<CatchRecord?> mostRecent() async {
    final all = await _store.all(limit: 1);
    return all.isEmpty ? null : all.first;
  }

  /// Records a catch from a quick weight preset. Always succeeds locally,
  /// even with no connection, and is deliberately fast: no exact weight is
  /// asked for here, only the tapped estimate - see [CatchRecord] for why.
  ///
  /// [fallbackLat]/[fallbackLon] are the map's last known user position. A
  /// fresh fix is attempted first; the fallback is only used if that fails,
  /// so a catch is still recorded rather than refused over a GPS hiccup.
  Future<CatchRecord> logCatch({
    required String? speciesName,
    required double estimatedQuantityKg,
    String? method,
    String? notes,
    double? fallbackLat,
    double? fallbackLon,
  }) async {
    final identity = await _identity.read();
    if (identity == null || !identity.isComplete) {
      throw StateError('Vessel identity is not set up.');
    }
    if (!estimatedQuantityKg.isFinite || estimatedQuantityKg <= 0) {
      throw ArgumentError('Quantity must be greater than zero.');
    }

    final fix = await _location.currentFix();
    final now = DateTime.now().toUtc();

    final record = CatchRecord(
      localId: newLocalId(),
      vesselId: identity.vesselId,
      speciesName: speciesName?.trim().isEmpty ?? true
          ? null
          : speciesName!.trim(),
      estimatedQuantityKg: estimatedQuantityKg,
      catchDate: _isoDate(now),
      clientTs: now.millisecondsSinceEpoch ~/ 1000,
      state: SyncState.pending,
      lat: fix?.lat ?? fallbackLat,
      lon: fix?.lon ?? fallbackLon,
      method: method?.trim().isEmpty ?? true ? null : method!.trim(),
      notes: CatchRecord.clampNotes(notes),
    );

    await _store.insert(record);
    _changes.add(null);

    unawaited(syncPending());
    return record;
  }

  /// The fisherman reweighed a catch and is confirming the real figure -
  /// typically once ashore, well after the estimate already synced.
  ///
  /// Saved locally first, same as everything else, then a single attempt is
  /// made to push it right away. If that fails (no signal yet, most likely),
  /// it is left for the next [syncPending] tick to pick up via
  /// [CatchStore.awaitingWeightSync] - it is never silently dropped.
  Future<CatchRecord> confirmWeight(String localId, double quantityKg) async {
    if (!quantityKg.isFinite || quantityKg <= 0) {
      throw ArgumentError('Quantity must be greater than zero.');
    }
    final updated = await _store.confirmWeight(localId, quantityKg);
    _changes.add(null);
    if (updated == null) {
      throw StateError('confirmWeight called for a catch that no longer exists');
    }
    unawaited(_pushWeightConfirmation(updated));
    return updated;
  }

  Future<void> syncPending() async {
    if (_syncRunning) {
      return;
    }
    _syncRunning = true;
    var changed = false;
    try {
      changed = await _syncPendingUploads() || changed;
      // Independent of the upload loop above, and always attempted even if
      // that loop bailed out on a dead connection - both will simply fail
      // fast together, and a weight confirmation must never wait behind an
      // unrelated backlog of brand-new catches.
      changed = await _syncPendingWeightConfirmations() || changed;
    } finally {
      _syncRunning = false;
      if (changed) {
        _changes.add(null);
      }
    }
  }

  Future<bool> _syncPendingUploads() async {
    var changed = false;
    final pending = await _store.awaitingSync();
    for (final record in pending) {
      final result = await _backend.postCatchLog(record.toBackendPayload());
      switch (result.kind) {
        case CatchUploadKind.success:
          await _store.markSynced(record.localId, serverId: result.serverId);
          changed = true;
        case CatchUploadKind.rejected:
          await _store.markRejected(
            record.localId,
            result.message ?? 'Rejected by server',
          );
          changed = true;
        case CatchUploadKind.retry:
          await _store.recordFailure(
            record.localId,
            result.message ?? 'Upload failed',
          );
          changed = true;
          // The connection is down. Stop rather than hammering the rest of
          // the queue with attempts that will all fail the same way.
          return changed;
      }
    }
    return changed;
  }

  Future<bool> _syncPendingWeightConfirmations() async {
    var changed = false;
    final pending = await _store.awaitingWeightSync();
    for (final record in pending) {
      final pushed = await _pushWeightConfirmation(record);
      if (pushed) {
        changed = true;
      } else {
        // Same reasoning as the upload loop: a dead connection will fail the
        // rest identically, so stop rather than burn through every record.
        break;
      }
    }
    return changed;
  }

  /// A single attempt to push one confirmed weight. Never throws - a failed
  /// push just leaves the record queued for the next tick.
  Future<bool> _pushWeightConfirmation(CatchRecord record) async {
    final serverId = record.serverId;
    if (serverId == null || record.quantityKg == null) {
      // No server id yet (initial upload has not synced) or nothing
      // confirmed to send - either way, nothing to do until that changes.
      return false;
    }
    final ok = await _backend.confirmCatchWeight(
      serverId,
      record.toConfirmWeightPayload(),
    );
    if (ok) {
      await _store.markWeightSynced(record.localId);
    }
    return ok;
  }

  static String _isoDate(DateTime utc) {
    final month = utc.month.toString().padLeft(2, '0');
    final day = utc.day.toString().padLeft(2, '0');
    return '${utc.year}-$month-$day';
  }

  static String newLocalId() {
    final random = Random.secure();
    final stamp = DateTime.now().toUtc().millisecondsSinceEpoch;
    final suffix = List<String>.generate(
      8,
      (_) => random.nextInt(16).toRadixString(16),
    ).join();
    return '$stamp-$suffix';
  }
}
