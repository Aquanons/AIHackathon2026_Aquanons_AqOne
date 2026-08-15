import '../core/config.dart';

/// Where a queued fishing-spot report has got to.
///
/// Mirrors [SyncState] in catch_record.dart in shape, kept as a separate
/// type rather than shared: a fishing spot has no LoRa path and no weight-
/// confirm step, and coupling the two enums would make catch logging's
/// state machine sensitive to changes made for spots, and vice versa.
enum SpotSyncState {
  pending('pending', 'Saved on this phone', 'Will upload when you have signal.'),
  synced('synced', 'Uploaded', 'Visible to other fishermen with the app.'),
  rejected('rejected', 'Rejected', 'The server would not accept this report.');

  const SpotSyncState(this.wire, this.title, this.description);

  final String wire;
  final String title;
  final String description;

  static SpotSyncState fromWire(String? value) {
    for (final state in SpotSyncState.values) {
      if (state.wire == value) {
        return state;
      }
    }
    return SpotSyncState.pending;
  }
}

/// A fishing spot reported by the fisherman, queued locally until it can be
/// uploaded - same offline-first shape as [CatchRecord].
///
/// Deliberately carries no prediction/trend/health/reporter-count fields.
/// The reference dashboard this was ported from shows those for six
/// hardcoded demo zones with no model behind them; the real, backend-driven
/// part of that dashboard (`GET /api/spots`) only ever returns a location
/// and who reported it; see `buildTooltipContent`/`buildHotspotPopup` in the
/// original dashboard.js, which render an honest "no automated
/// classification" line whenever `prediction` is null - exactly the case
/// for every spot this app will ever create. Fabricating a percentage here
/// would be lying to the fisherman about a model that does not exist.
class FishingSpot {
  const FishingSpot({
    required this.localId,
    required this.vesselId,
    required this.latitude,
    required this.longitude,
    required this.clientTs,
    required this.state,
    this.postedBy,
    this.speciesName,
    this.notes,
    this.attempts = 0,
    this.lastError,
    this.serverId,
    this.syncedAt,
  });

  final String localId;
  final String vesselId;

  /// Unlike a catch log's GPS fix (which may be missing), a spot report has
  /// no purpose without a position, so both are required rather than
  /// nullable.
  final double latitude;
  final double longitude;

  final int clientTs;
  final SpotSyncState state;

  /// The boat name shown to other fishermen. Denormalized onto the record at
  /// report time rather than looked up - see backend/app/api/spots.py.
  final String? postedBy;
  final String? speciesName;
  final String? notes;
  final int attempts;
  final String? lastError;
  final String? serverId;
  final int? syncedAt;

  bool get awaitsSync => state == SpotSyncState.pending;

  DateTime get createdAt =>
      DateTime.fromMillisecondsSinceEpoch(clientTs * 1000, isUtc: true)
          .toLocal();

  FishingSpot copyWith({
    SpotSyncState? state,
    int? attempts,
    String? lastError,
    String? serverId,
    int? syncedAt,
    bool clearError = false,
  }) {
    return FishingSpot(
      localId: localId,
      vesselId: vesselId,
      latitude: latitude,
      longitude: longitude,
      clientTs: clientTs,
      state: state ?? this.state,
      postedBy: postedBy,
      speciesName: speciesName,
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
        'posted_by': postedBy,
        'latitude': latitude,
        'longitude': longitude,
        'species_name': speciesName,
        'notes': notes,
        'client_ts': clientTs,
        'state': state.wire,
        'attempts': attempts,
        'last_error': lastError,
        'server_id': serverId,
        'synced_at': syncedAt,
      };

  static FishingSpot fromRow(Map<String, Object?> row) => FishingSpot(
        localId: row['local_id'] as String,
        vesselId: row['vessel_id'] as String,
        postedBy: row['posted_by'] as String?,
        latitude: (row['latitude'] as num).toDouble(),
        longitude: (row['longitude'] as num).toDouble(),
        speciesName: row['species_name'] as String?,
        notes: row['notes'] as String?,
        clientTs: row['client_ts'] as int,
        state: SpotSyncState.fromWire(row['state'] as String?),
        attempts: (row['attempts'] as num?)?.toInt() ?? 0,
        lastError: row['last_error'] as String?,
        serverId: row['server_id'] as String?,
        syncedAt: (row['synced_at'] as num?)?.toInt(),
      );

  /// Body for `POST /api/spots`. `local_id` doubles as an idempotency key -
  /// this record may be retried several times across reconnects, and the
  /// backend must not create a duplicate row each time.
  Map<String, Object?> toBackendPayload() {
    final payload = <String, Object?>{
      'local_id': localId,
      'vessel_id': vesselId,
      'latitude': latitude,
      'longitude': longitude,
    };
    if (postedBy != null && postedBy!.trim().isNotEmpty) {
      payload['posted_by'] = postedBy!.trim();
    }
    if (speciesName != null && speciesName!.trim().isNotEmpty) {
      payload['species_name'] = speciesName!.trim();
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
    return trimmed.length <= AqOneConfig.maxSpotNoteLength
        ? trimmed
        : trimmed.substring(0, AqOneConfig.maxSpotNoteLength);
  }
}
