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
      trustTier: identity.trustTier,
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

  /// Deliver one SOS by every route available, and stop once any succeeds.
  ///
  /// Three layers, in the order they can be relied on:
  ///
  ///   1. local   the record is already in the outbox before this runs, so the
  ///              SOS survives a dead battery, a crash or a reinstall
  ///   2. buoy    phone -> WiFi -> LoRa mesh -> gateway -> backend, the route
  ///              that works with no cellular signal at all
  ///   3. direct  phone -> HTTPS -> backend, when the handset has internet
  ///
  /// Both transports are attempted, not one as a fallback for the other. For a
  /// distress call redundancy beats tidiness: the buoy may be out of range and
  /// the cell signal may be marginal, and there is no way to know in advance
  /// which will get through. The backend de-duplicates on
  /// (vessel_id, client_ts), so two successful deliveries are still one
  /// incident on the dispatcher's screen.
  Future<bool> _attemptRelay(String localId, {bool notify = true}) async {
    final record = await _outbox.byLocalId(localId);
    if (record == null || !record.awaitsRelay) {
      return true;
    }

    // Fired together rather than sequentially - waiting for a 6-second buoy
    // timeout before trying the internet would delay a distress call for no
    // reason. Each attempt captures its own failure so one route going down
    // never cancels the other.
    Future<Object?> tryBuoy() async {
      try {
        return await _buoy.handoff(record);
      } catch (error) {
        return error;
      }
    }

    Future<bool> tryDirect() async {
      try {
        return await _backend.postSos(record);
      } catch (_) {
        return false;
      }
    }

    final buoyFuture = tryBuoy();
    final directFuture = tryDirect();
    final buoyResult = await buoyFuture;
    final directOk = await directFuture;

    if (buoyResult is BuoyAck) {
      await _outbox.advance(
        localId,
        DeliveryState.relayed,
        buoyId: buoyResult.buoyId,
        srcId: buoyResult.srcId,
        seq: buoyResult.seq,
        serverTs: buoyResult.serverTs,
      );
      if (notify) {
        _changes.add(null);
      }
      return true;
    }

    if (directOk) {
      // The backend has it. No buoy metadata to record, because this copy
      // never touched the mesh.
      await _outbox.advance(localId, DeliveryState.relayed);
      if (notify) {
        _changes.add(null);
      }
      return true;
    }

    // Neither route worked. Keep the reason from the buoy attempt, which is
    // the more informative of the two, and leave the record pending so the
    // retry timer picks it up again.
    final reason = buoyResult is BuoyRejected
        ? buoyResult.reason
        : buoyResult is BuoyUnreachable
            ? buoyResult.reason
            : 'no buoy in range and no internet connection';
    await _outbox.recordFailure(localId, reason);
    if (notify) {
      _changes.add(null);
    }
    return false;
  }

  /// Send the fisher's one-tap answer to a responder acknowledgement.
  ///
  /// 1 = still in danger, 2 = safe now. Saved locally first so the button
  /// reflects what the fisher pressed even if the network call fails - being
  /// told "your reply failed" while waiting for rescue is worse than useless,
  /// and the record is retried by the normal reconcile cycle.
  Future<bool> replyToSos(String localId, int reply) async {
    final record = await _outbox.byLocalId(localId);
    if (record == null) {
      return false;
    }
    await _outbox.saveFisherReply(localId, reply);
    _changes.add(null);

    final remoteId = record.remoteId;
    if (remoteId == null) {
      // The backend has not told us its id for this incident yet, so there is
      // nothing to attach the reply to. The next reconcile will bring it.
      return false;
    }
    return _backend.replyToSos(int.tryParse(remoteId) ?? -1, reply);
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

        // Match on local_id first, seq only as a fallback.
        //
        // seq is assigned by the buoy ack, so an SOS that reached the backend
        // over the direct path never has one. Matching on seq alone meant those
        // records could never be reconciled and the fisher never learned they
        // had been acknowledged - which, now that the direct path exists, is
        // the common case rather than the edge case.
        final byLocalId = <String, RemoteSos>{
          for (final row in remote)
            if (row.localId != null && row.localId!.isNotEmpty) row.localId!: row,
        };

        for (final record in pending.where((r) => r.vesselId == vesselId)) {
          final seq = record.seq;
          final match = byLocalId[record.localId] ?? (seq == null ? null : bySeq[seq]);
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
          // Responder details live alongside the delivery state: the ETA and
          // status are what the fisher is actually waiting to see.
          final stored = await _outbox.saveResponder(
            record.localId,
            remoteId: match.id,
            etaAt: match.etaAt,
            responderStatus: match.responderStatus,
            responderNote: match.responderNote ?? match.responderStatusLabel,
          );
          if (stored) {
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
