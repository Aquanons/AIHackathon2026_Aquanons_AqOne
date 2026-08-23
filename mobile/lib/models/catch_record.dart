import '../core/config.dart';

/// Where a queued catch log has got to.
///
/// Deliberately not [DeliveryState]: that enum describes an SOS travelling
/// over the buoy mesh, and its copy says so. A catch log never goes over
/// LoRa - airtime is reserved for distress - so it simply waits on the
/// handset until the phone has internet again.
enum SyncState {
  pending('pending', 'Saved on this phone', 'Will upload when you have signal.'),
  synced('synced', 'Uploaded', 'Recorded on the AqOne backend.'),
  rejected('rejected', 'Rejected', 'The server would not accept this entry.');

  const SyncState(this.wire, this.title, this.description);

  final String wire;
  final String title;
  final String description;

  static SyncState fromWire(String? value) {
    for (final state in SyncState.values) {
      if (state.wire == value) {
        return state;
      }
    }
    return SyncState.pending;
  }
}

/// A catch logged by the fisherman, queued locally until it can be uploaded.
///
/// Weight is deliberately split into two numbers. At the moment of catching,
/// typing an exact figure is the slowest part of the whole flow, and it is
/// rarely accurate anyway - a proper scale is usually back on land, not in
/// the boat. So logging a catch only ever asks for a quick preset
/// ([estimatedQuantityKg]), and species/count sync to the backend on that
/// estimate immediately. [quantityKg] - the real, reweighed figure - stays
/// null until the fisherman deliberately confirms it, typically once ashore,
/// and syncs separately from the initial upload.
class CatchRecord {
  const CatchRecord({
    required this.localId,
    required this.vesselId,
    required this.speciesName,
    required this.estimatedQuantityKg,
    required this.catchDate,
    required this.clientTs,
    required this.state,
    this.shareForHotspots = false,
    this.quantityKg,
    this.quantityConfirmedAt,
    this.quantitySyncedAt,
    this.lat,
    this.lon,
    this.method,
    this.notes,
    this.attempts = 0,
    this.lastError,
    this.serverId,
    this.syncedAt,
  });

  final String localId;
  final String vesselId;

  /// Null means the fisherman chose "Other" without naming a species. Kept
  /// nullable rather than coerced to a placeholder so reporting can tell the
  /// difference between unknown and mislabelled.
  final String? speciesName;

  /// The preset tapped at the moment of catching - a quick guess, not a
  /// measurement. Always set; this is what makes near-instant logging
  /// possible at all.
  final double estimatedQuantityKg;

  /// The reweighed, confirmed figure. Null until the fisherman deliberately
  /// confirms a weight - this is never inferred from the estimate.
  final double? quantityKg;

  /// When the fisherman confirmed a weight on this handset. Null means no
  /// confirmation has happened yet, regardless of what [quantityKg] holds.
  final int? quantityConfirmedAt;

  /// When that confirmed weight successfully reached the backend. Null with
  /// [quantityConfirmedAt] set means the confirmation is queued locally,
  /// waiting for signal - mirrors [syncedAt] for the initial upload.
  final int? quantitySyncedAt;

  /// Calendar date of the catch, as `YYYY-MM-DD`.
  final String catchDate;

  final int clientTs;
  final SyncState state;
  final bool shareForHotspots;
  final double? lat;
  final double? lon;
  final String? method;
  final String? notes;
  final int attempts;
  final String? lastError;
  final String? serverId;
  final int? syncedAt;

  bool get hasFix => lat != null && lon != null;

  bool get awaitsSync => state == SyncState.pending;

  bool get isWeightConfirmed => quantityConfirmedAt != null;

  /// A confirmation was made on this handset but has not yet reached the
  /// backend - it needs the initial upload's server id first, and then a
  /// moment of signal to push it.
  bool get awaitsWeightSync =>
      quantityConfirmedAt != null && quantitySyncedAt == null;

  DateTime get createdAt =>
      DateTime.fromMillisecondsSinceEpoch(clientTs * 1000, isUtc: true)
          .toLocal();

  CatchRecord copyWith({
    SyncState? state,
    int? attempts,
    String? lastError,
    String? serverId,
    int? syncedAt,
    double? quantityKg,
    int? quantityConfirmedAt,
    int? quantitySyncedAt,
    bool clearError = false,
  }) {
    return CatchRecord(
      localId: localId,
      vesselId: vesselId,
      speciesName: speciesName,
      estimatedQuantityKg: estimatedQuantityKg,
      catchDate: catchDate,
      clientTs: clientTs,
      state: state ?? this.state,
      shareForHotspots: shareForHotspots,
      quantityKg: quantityKg ?? this.quantityKg,
      quantityConfirmedAt: quantityConfirmedAt ?? this.quantityConfirmedAt,
      quantitySyncedAt: quantitySyncedAt ?? this.quantitySyncedAt,
      lat: lat,
      lon: lon,
      method: method,
      notes: notes,
      attempts: attempts ?? this.attempts,
      lastError: clearError ? null : (lastError ?? this.lastError),
      serverId: serverId ?? this.serverId,
      syncedAt: syncedAt ?? this.syncedAt,
    );
  }

  Map<String, Object?> toRow() => <String, Object?>{
        'local_id': localId,
        'vessel_id': vesselId,
        'species_name': speciesName,
        'estimated_quantity_kg': estimatedQuantityKg,
        'quantity_kg': quantityKg,
        'quantity_confirmed_at': quantityConfirmedAt,
        'quantity_synced_at': quantitySyncedAt,
        'catch_date': catchDate,
        'client_ts': clientTs,
        'state': state.wire,
        'share_for_hotspots': shareForHotspots ? 1 : 0,
        'lat': lat,
        'lon': lon,
        'method': method,
        'notes': notes,
        'attempts': attempts,
        'last_error': lastError,
        'server_id': serverId,
        'synced_at': syncedAt,
      };

  static CatchRecord fromRow(Map<String, Object?> row) => CatchRecord(
        localId: row['local_id'] as String,
        vesselId: row['vessel_id'] as String,
        speciesName: row['species_name'] as String?,
        estimatedQuantityKg: (row['estimated_quantity_kg'] as num).toDouble(),
        quantityKg: (row['quantity_kg'] as num?)?.toDouble(),
        quantityConfirmedAt: (row['quantity_confirmed_at'] as num?)?.toInt(),
        quantitySyncedAt: (row['quantity_synced_at'] as num?)?.toInt(),
        catchDate: row['catch_date'] as String,
        clientTs: row['client_ts'] as int,
        state: SyncState.fromWire(row['state'] as String?),
        shareForHotspots:
            ((row['share_for_hotspots'] as num?)?.toInt() ?? 0) == 1,
        lat: (row['lat'] as num?)?.toDouble(),
        lon: (row['lon'] as num?)?.toDouble(),
        method: row['method'] as String?,
        notes: row['notes'] as String?,
        attempts: (row['attempts'] as num?)?.toInt() ?? 0,
        lastError: row['last_error'] as String?,
        serverId: row['server_id'] as String?,
        syncedAt: (row['synced_at'] as num?)?.toInt(),
      );

  /// Body for the initial `POST /api/catch-logs`.
  ///
  /// Carries the estimate only - never [quantityKg], even if it happens to
  /// already be confirmed by the time this fires. Confirmation is always a
  /// deliberate, separate call ([toConfirmWeightPayload]), so the two can
  /// never be conflated into one write.
  ///
  /// `local_id` doubles as an idempotency key: this record may be retried
  /// several times across reconnects, and the backend must not create a
  /// duplicate row each time.
  Map<String, Object?> toBackendPayload() {
    final payload = <String, Object?>{
      'local_id': localId,
      'vessel_id': vesselId,
      'species_name': speciesName,
      'catch_date': catchDate,
      'estimated_quantity_kg': estimatedQuantityKg,
      'share_for_hotspots': shareForHotspots,
    };
    if (lat != null) {
      payload['latitude'] = lat;
    }
    if (lon != null) {
      payload['longitude'] = lon;
    }
    final trimmedMethod = method?.trim();
    if (trimmedMethod != null && trimmedMethod.isNotEmpty) {
      payload['method'] = trimmedMethod;
    }
    final trimmedNotes = notes?.trim();
    if (trimmedNotes != null && trimmedNotes.isNotEmpty) {
      payload['notes'] = trimmedNotes;
    }
    return payload;
  }

  /// Body for `POST /api/catch-logs/{id}/confirm-weight`.
  Map<String, Object?> toConfirmWeightPayload() => <String, Object?>{
        'quantity_kg': quantityKg,
      };

  static String? clampNotes(String? value) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return null;
    }
    return trimmed.length <= AqOneConfig.maxCatchNoteLength
        ? trimmed
        : trimmed.substring(0, AqOneConfig.maxCatchNoteLength);
  }
}
