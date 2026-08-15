import 'dart:async';
import 'dart:math';

import '../core/config.dart';
import '../data/fishing_spot_store.dart';
import '../data/identity_store.dart';
import '../models/fishing_spot.dart';
import 'backend_client.dart';

/// Queues fishing-spot reports locally and uploads them when the phone has
/// signal. Mirrors [CatchService] in shape, minus the weight-confirmation
/// half - a spot report has nothing that arrives later the way a reweighed
/// catch does, so the sync loop here is a single pass, not two.
class FishingSpotService {
  FishingSpotService({
    required FishingSpotStore store,
    required IdentityStore identity,
    required BackendClient backend,
  })  : _store = store,
        _identity = identity,
        _backend = backend;

  final FishingSpotStore _store;
  final IdentityStore _identity;
  final BackendClient _backend;

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

  Future<List<FishingSpot>> history() => _store.all();

  Future<int> pendingCount() => _store.pendingCount();

  /// Records a fishing spot at the given position. Always succeeds locally,
  /// even with no connection - the position is supplied by the caller
  /// (typically a fresh GPS fix taken at the moment of reporting) rather
  /// than looked up here, so this never blocks on location services on its
  /// own account.
  Future<FishingSpot> reportSpot({
    required double latitude,
    required double longitude,
    String? speciesName,
    String? notes,
  }) async {
    final identity = await _identity.read();
    if (identity == null || !identity.isComplete) {
      throw StateError('Vessel identity is not set up.');
    }
    if (!latitude.isFinite ||
        !longitude.isFinite ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180) {
      throw ArgumentError('A valid position is required to report a spot.');
    }

    final now = DateTime.now().toUtc();
    final record = FishingSpot(
      localId: newLocalId(),
      vesselId: identity.vesselId,
      latitude: latitude,
      longitude: longitude,
      clientTs: now.millisecondsSinceEpoch ~/ 1000,
      state: SpotSyncState.pending,
      postedBy: identity.boat,
      speciesName: speciesName?.trim().isEmpty ?? true
          ? null
          : speciesName!.trim(),
      notes: FishingSpot.clampNotes(notes),
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
      changed = await _syncPendingUploads();
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
      final result = await _backend.postFishingSpot(record.toBackendPayload());
      switch (result.kind) {
        case SpotUploadKind.success:
          await _store.markSynced(record.localId, serverId: result.serverId);
          changed = true;
        case SpotUploadKind.rejected:
          await _store.markRejected(
            record.localId,
            result.message ?? 'Rejected by server',
          );
          changed = true;
        case SpotUploadKind.retry:
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
