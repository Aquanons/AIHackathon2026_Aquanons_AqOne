import '../core/config.dart';
import 'delivery_state.dart';

const Object _unset = Object();

class SosRecord {
  const SosRecord({
    required this.localId,
    required this.vesselId,
    required this.boat,
    required this.clientTs,
    required this.state,
    this.lat,
    this.lon,
    this.note,
    this.buoyId,
    this.srcId,
    this.seq,
    this.serverTs,
    this.attempts = 0,
    this.lastError,
    this.relayedAt,
    this.deliveredAt,
    this.acknowledgedAt,
    this.ackedBy,
  });

  final String localId;
  final String vesselId;
  final String boat;
  final int clientTs;
  final DeliveryState state;
  final double? lat;
  final double? lon;
  final String? note;
  final int? buoyId;
  final int? srcId;
  final int? seq;
  final int? serverTs;
  final int attempts;
  final String? lastError;
  final int? relayedAt;
  final int? deliveredAt;
  final int? acknowledgedAt;
  final String? ackedBy;

  bool get hasFix => lat != null && lon != null;

  bool get awaitsRelay => state == DeliveryState.saved;

  bool get awaitsReconcile =>
      state == DeliveryState.relayed || state == DeliveryState.delivered;

  DateTime get createdAt =>
      DateTime.fromMillisecondsSinceEpoch(clientTs * 1000, isUtc: true).toLocal();

  SosRecord copyWith({
    DeliveryState? state,
    int? buoyId,
    int? srcId,
    int? seq,
    int? serverTs,
    int? attempts,
    Object? lastError = _unset,
    int? relayedAt,
    int? deliveredAt,
    int? acknowledgedAt,
    String? ackedBy,
  }) {
    return SosRecord(
      localId: localId,
      vesselId: vesselId,
      boat: boat,
      clientTs: clientTs,
      state: state ?? this.state,
      lat: lat,
      lon: lon,
      note: note,
      buoyId: buoyId ?? this.buoyId,
      srcId: srcId ?? this.srcId,
      seq: seq ?? this.seq,
      serverTs: serverTs ?? this.serverTs,
      attempts: attempts ?? this.attempts,
      lastError: identical(lastError, _unset)
          ? this.lastError
          : lastError as String?,
      relayedAt: relayedAt ?? this.relayedAt,
      deliveredAt: deliveredAt ?? this.deliveredAt,
      acknowledgedAt: acknowledgedAt ?? this.acknowledgedAt,
      ackedBy: ackedBy ?? this.ackedBy,
    );
  }

  Map<String, Object?> toRow() => <String, Object?>{
        'local_id': localId,
        'vessel_id': vesselId,
        'boat': boat,
        'client_ts': clientTs,
        'state': state.wire,
        'lat': lat,
        'lon': lon,
        'note': note,
        'buoy_id': buoyId,
        'src_id': srcId,
        'seq': seq,
        'server_ts': serverTs,
        'attempts': attempts,
        'last_error': lastError,
        'relayed_at': relayedAt,
        'delivered_at': deliveredAt,
        'acknowledged_at': acknowledgedAt,
        'acked_by': ackedBy,
      };

  static SosRecord fromRow(Map<String, Object?> row) => SosRecord(
        localId: row['local_id'] as String,
        vesselId: row['vessel_id'] as String,
        boat: row['boat'] as String,
        clientTs: row['client_ts'] as int,
        state: DeliveryState.fromWire(row['state'] as String?),
        lat: (row['lat'] as num?)?.toDouble(),
        lon: (row['lon'] as num?)?.toDouble(),
        note: row['note'] as String?,
        buoyId: (row['buoy_id'] as num?)?.toInt(),
        srcId: (row['src_id'] as num?)?.toInt(),
        seq: (row['seq'] as num?)?.toInt(),
        serverTs: (row['server_ts'] as num?)?.toInt(),
        attempts: (row['attempts'] as num?)?.toInt() ?? 0,
        lastError: row['last_error'] as String?,
        relayedAt: (row['relayed_at'] as num?)?.toInt(),
        deliveredAt: (row['delivered_at'] as num?)?.toInt(),
        acknowledgedAt: (row['acknowledged_at'] as num?)?.toInt(),
        ackedBy: row['acked_by'] as String?,
      );

  Map<String, Object?> toBuoyPayload() {
    final payload = <String, Object?>{
      'v': AqOneConfig.protocolVersion,
      'vessel_id': vesselId,
      'boat': boat,
      'client_ts': clientTs,
    };
    if (lat != null) {
      payload['lat'] = lat;
    }
    if (lon != null) {
      payload['lon'] = lon;
    }
    final trimmed = note?.trim();
    if (trimmed != null && trimmed.isNotEmpty) {
      payload['note'] = trimmed;
    }
    return payload;
  }
}
