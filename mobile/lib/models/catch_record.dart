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
class CatchRecord {
  const CatchRecord({
    required this.localId,
    required this.vesselId,
    required this.speciesName,
    required this.quantityKg,
    required this.catchDate,
    required this.clientTs,
    required this.state,
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

  final double quantityKg;

  /// Calendar date of the catch, as `YYYY-MM-DD`.
  final String catchDate;

  final int clientTs;
  final SyncState state;
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

  DateTime get createdAt =>
      DateTime.fromMillisecondsSinceEpoch(clientTs * 1000, isUtc: true)
          .toLocal();

  CatchRecord copyWith({
    SyncState? state,
    int? attempts,
    String? lastError,
    String? serverId,
    int? syncedAt,
    bool clearError = false,
  }) {
    return CatchRecord(
      localId: localId,
      vesselId: vesselId,
      speciesName: speciesName,
      quantityKg: quantityKg,
      catchDate: catchDate,
      clientTs: clientTs,
      state: state ?? this.state,
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
        'quantity_kg': quantityKg,
        'catch_date': catchDate,
        'client_ts': clientTs,
        'state': state.wire,
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
        quantityKg: (row['quantity_kg'] as num).toDouble(),
        catchDate: row['catch_date'] as String,
        clientTs: row['client_ts'] as int,
        state: SyncState.fromWire(row['state'] as String?),
        lat: (row['lat'] as num?)?.toDouble(),
        lon: (row['lon'] as num?)?.toDouble(),
        method: row['method'] as String?,
        notes: row['notes'] as String?,
        attempts: (row['attempts'] as num?)?.toInt() ?? 0,
        lastError: row['last_error'] as String?,
        serverId: row['server_id'] as String?,
        syncedAt: (row['synced_at'] as num?)?.toInt(),
      );

  /// Body for `POST /api/catch-logs`.
  ///
  /// `local_id` doubles as an idempotency key: this record may be retried
  /// several times across reconnects, and the backend must not create a
  /// duplicate row each time. If the server ignores it, retries will
  /// duplicate - worth confirming against the API before demo day.
  Map<String, Object?> toBackendPayload() {
    final payload = <String, Object?>{
      'local_id': localId,
      'vessel_id': vesselId,
      'species_name': speciesName,
      'catch_date': catchDate,
      'quantity_kg': quantityKg,
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
