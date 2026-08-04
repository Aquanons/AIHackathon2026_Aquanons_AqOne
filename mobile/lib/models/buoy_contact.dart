enum MeshHealth {
  ok('ok', 'Mesh reachable'),
  degraded('degraded', 'Mesh degraded — your message will wait on the buoy'),
  unknown('unknown', 'Mesh state unknown');

  const MeshHealth(this.wire, this.description);

  final String wire;
  final String description;

  static MeshHealth fromWire(String? value) {
    for (final health in MeshHealth.values) {
      if (health.wire == value) {
        return health;
      }
    }
    return MeshHealth.unknown;
  }
}

class BuoyStatus {
  const BuoyStatus({
    required this.buoyId,
    required this.battery,
    required this.mesh,
    required this.queued,
    required this.observedAt,
  });

  final int buoyId;
  final int battery;
  final MeshHealth mesh;
  final int queued;
  final DateTime observedAt;

  bool get hasBattery => battery >= 0 && battery <= 100;

  static BuoyStatus fromJson(Map<String, dynamic> json) {
    return BuoyStatus(
      buoyId: (json['buoy_id'] as num?)?.toInt() ?? -1,
      battery: (json['batt'] as num?)?.toInt() ?? -1,
      mesh: MeshHealth.fromWire(json['mesh'] as String?),
      queued: (json['queued'] as num?)?.toInt() ?? 0,
      observedAt: DateTime.now(),
    );
  }
}

class BuoyAck {
  const BuoyAck({
    required this.accepted,
    required this.buoyId,
    required this.srcId,
    required this.seq,
    required this.serverTs,
  });

  final bool accepted;
  final int buoyId;
  final int srcId;
  final int seq;
  final int serverTs;

  static BuoyAck fromJson(Map<String, dynamic> json) {
    return BuoyAck(
      accepted: json['accepted'] == true,
      buoyId: (json['buoy_id'] as num?)?.toInt() ?? -1,
      srcId: (json['src_id'] as num?)?.toInt() ?? -1,
      seq: (json['seq'] as num?)?.toInt() ?? -1,
      serverTs: (json['server_ts'] as num?)?.toInt() ??
          DateTime.now().millisecondsSinceEpoch ~/ 1000,
    );
  }
}
