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
/// The source project posted catches straight to HTTP, so a catch logged out
/// of range was simply lost. Fishermen log catches at sea, which is exactly
/// where there is no signal, so the write is queued first and uploaded later.
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

  Future<int> pendingCount() => _store.pendingCount();

  /// Records a catch. Always succeeds locally, even with no connection.
  ///
  /// [fallbackLat]/[fallbackLon] are the map's last known user position. A
  /// fresh fix is attempted first; the fallback is only used if that fails,
  /// so a catch is still recorded rather than refused over a GPS hiccup.
  Future<CatchRecord> logCatch({
    required String? speciesName,
    required double quantityKg,
    String? method,
    String? notes,
    double? fallbackLat,
    double? fallbackLon,
  }) async {
    final identity = await _identity.read();
    if (identity == null || !identity.isComplete) {
      throw StateError('Vessel identity is not set up.');
    }
    if (!quantityKg.isFinite || quantityKg <= 0) {
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
      quantityKg: quantityKg,
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

  Future<void> syncPending() async {
    if (_syncRunning) {
      return;
    }
    _syncRunning = true;
    var changed = false;
    try {
      final pending = await _store.awaitingSync();
      if (pending.isEmpty) {
        return;
      }
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
            return;
        }
      }
    } finally {
      _syncRunning = false;
      if (changed) {
        _changes.add(null);
      }
    }
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
