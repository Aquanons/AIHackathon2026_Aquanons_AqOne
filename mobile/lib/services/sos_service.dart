import 'dart:async';
import 'dart:math';

import '../core/config.dart';
import '../data/identity_store.dart';
import '../data/outbox_store.dart';
import '../models/buoy_contact.dart';
import '../models/delivery_state.dart';
import '../models/sos_record.dart';
import 'backend_client.dart';
import 'buoy_client.dart';
import 'location_service.dart';

class SosService {
  SosService({
    required OutboxStore outbox,
    required IdentityStore identity,
    required BuoyClient buoy,
    required BackendClient backend,
    required LocationService location,
  })  : _outbox = outbox,
        _identity = identity,
        _buoy = buoy,
        _backend = backend,
        _location = location;

  final OutboxStore _outbox;
  final IdentityStore _identity;
  final BuoyClient _buoy;
  final BackendClient _backend;
  final LocationService _location;

  final StreamController<void> _changes = StreamController<void>.broadcast();
  Stream<void> get changes => _changes.stream;

  Timer? _relayTimer;
  Timer? _reconcileTimer;
  bool _relayRunning = false;
  bool _reconcileRunning = false;

  void start() {
    _relayTimer ??= Timer.periodic(
      AqOneConfig.outboxRetryInterval,
      (_) => retryPending(),
    );
    _reconcileTimer ??= Timer.periodic(
      AqOneConfig.reconcileInterval,
      (_) => reconcile(),
    );
  }

  void dispose() {
    _relayTimer?.cancel();
    _reconcileTimer?.cancel();
    _relayTimer = null;
    _reconcileTimer = null;
    _changes.close();
  }

  Future<List<SosRecord>> history() => _outbox.all();

  Future<SosRecord> raiseSos({String? note}) async {
    final identity = await _identity.read();
    if (identity == null || !identity.isComplete) {
      throw StateError('Vessel identity is not set up.');
    }

    final fix = await _location.currentFix();
    final record = SosRecord(
      localId: _newLocalId(),
      vesselId: identity.vesselId,
      boat: identity.boat,
      clientTs: DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000,
      state: DeliveryState.saved,
      lat: fix?.lat,
      lon: fix?.lon,
      note: _clampNote(note),
    );

    await _outbox.insert(record);
    _changes.add(null);

    unawaited(_attemptRelay(record.localId));
    return record;
  }

  Future<void> retryPending() async {
    if (_relayRunning) {
      return;
    }
    _relayRunning = true;
    try {
      final pending = await _outbox.awaitingRelay();
      for (final record in pending) {
        final ok = await _attemptRelay(record.localId, notify: false);
        if (!ok) {
          break;
        }
      }
    } finally {
      _relayRunning = false;
      _changes.add(null);
    }
  }

  Future<bool> _attemptRelay(String localId, {bool notify = true}) async {
    final record = await _outbox.byLocalId(localId);
    if (record == null || !record.awaitsRelay) {
      return true;
    }

    try {
      final ack = await _buoy.handoff(record);
      await _outbox.advance(
        localId,
        DeliveryState.relayed,
        buoyId: ack.buoyId,
        srcId: ack.srcId,
        seq: ack.seq,
        serverTs: ack.serverTs,
      );
      if (notify) {
        _changes.add(null);
      }
      return true;
    } on BuoyRejected catch (error) {
      await _outbox.recordFailure(localId, error.reason);
      if (notify) {
        _changes.add(null);
      }
      return false;
    } on BuoyUnreachable catch (error) {
      await _outbox.recordFailure(localId, error.reason);
      if (notify) {
        _changes.add(null);
      }
      return false;
    }
  }

  Future<BuoyStatus?> pollBuoy() async {
    try {
      return await _buoy.status();
    } catch (_) {
      return null;
    }
  }

  Future<void> reconcile() async {
    if (_reconcileRunning) {
      return;
    }
    _reconcileRunning = true;
    try {
      final pending = await _outbox.awaitingReconcile();
      if (pending.isEmpty) {
        return;
      }
      if (!await _backend.isReachable()) {
        return;
      }

      final vesselIds = pending.map((record) => record.vesselId).toSet();
      var changed = false;

      for (final vesselId in vesselIds) {
        final remote = await _backend.vesselSos(vesselId);
        if (remote.isEmpty) {
          continue;
        }
        final bySeq = <int, RemoteSos>{
          for (final row in remote)
            if (row.seq != null) row.seq!: row,
        };

        for (final record in pending.where((r) => r.vesselId == vesselId)) {
          final seq = record.seq;
          if (seq == null) {
            continue;
          }
          final match = bySeq[seq];
          if (match == null) {
            continue;
          }
          final advanced = await _outbox.advance(
            record.localId,
            match.deliveryState,
            ackedBy: match.ackedBy,
          );
          if (advanced != null && advanced.state != record.state) {
            changed = true;
          }
        }
      }

      if (changed) {
        _changes.add(null);
      }
    } catch (_) {
      return;
    } finally {
      _reconcileRunning = false;
    }
  }

  static String? _clampNote(String? note) {
    final trimmed = note?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return null;
    }
    return trimmed.length <= AqOneConfig.maxNoteLength
        ? trimmed
        : trimmed.substring(0, AqOneConfig.maxNoteLength);
  }

  static String _newLocalId() {
    final random = Random.secure();
    final stamp = DateTime.now().toUtc().millisecondsSinceEpoch;
    final suffix = List<String>.generate(
      8,
      (_) => random.nextInt(16).toRadixString(16),
    ).join();
    return '$stamp-$suffix';
  }
}
