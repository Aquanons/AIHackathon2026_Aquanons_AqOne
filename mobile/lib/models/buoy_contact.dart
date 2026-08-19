// Field shapes verified against the real firmware response, not the (stale)
// docs/03_PHONE_BUOY_WIFI.md - see docs/21_WEEK1_CONTRACT_FIXTURES.md and
// fixtures/week1_contract/*.json. The firmware
// (firmware/buoy/AqOneBuoy/AqOneBuoy.ino handleStatus()) does not send a
// battery reading or a mesh-health string today; it reports whether its
// shore/internet uplink is currently up and how many SOS messages are still
// queued for the mesh. Do not invent fields the firmware doesn't send - rule
// 4 of the Week 1 plan bans fake operational state.

class BuoyStatus {
  const BuoyStatus({
    required this.buoyId,
    required this.uplink,
    required this.queueDepth,
    required this.clients,
    required this.observedAt,
  });

  /// The firmware's `BUOY_ID` constant, e.g. `"BUOY01"`. A string, not a
  /// numeric id - `.ino` line ~381: `doc["buoy_id"] = BUOY_ID;` where
  /// `BUOY_ID` is `const char*`.
  final String buoyId;

  /// Whether this buoy currently has a working shore/internet link
  /// (`json['uplink']`). `true` means an SOS handed to this buoy reaches the
  /// rescue centre now; `false` means the buoy will hold it and deliver it
  /// automatically once the link returns (mirrors the buoy's own captive
  /// portal copy in `.ino` `handlePortal()`).
  final bool uplink;

  /// Number of SOS messages still waiting to be forwarded
  /// (`json['queue_depth']`, not `queued` - the field name in the earlier
  /// doc/plan draft did not match the firmware).
  final int queueDepth;

  /// Phones currently associated with this buoy's access point
  /// (`json['clients']`, `WiFi.softAPgetStationNum()`).
  final int clients;

  final DateTime observedAt;

  static BuoyStatus fromJson(Map<String, dynamic> json) {
    return BuoyStatus(
      buoyId: (json['buoy_id'] as Object?)?.toString() ?? 'unknown',
      uplink: json['uplink'] == true,
      queueDepth: (json['queue_depth'] as num?)?.toInt() ?? 0,
      clients: (json['clients'] as num?)?.toInt() ?? 0,
      observedAt: DateTime.now(),
    );
  }
}

class BuoyAck {
  const BuoyAck({
    required this.accepted,
    required this.buoyId,
    required this.seq,
    required this.serverTs,
  });

  final bool accepted;

  /// String, matching the firmware's `BUOY_ID` constant - see [BuoyStatus.buoyId].
  final String buoyId;
  final int seq;

  /// Seconds since the buoy booted (`millis() / 1000`), NOT a wall-clock
  /// epoch timestamp. Do not render this as an absolute time.
  final int serverTs;

  static BuoyAck fromJson(Map<String, dynamic> json) {
    return BuoyAck(
      accepted: json['accepted'] == true,
      buoyId: (json['buoy_id'] as Object?)?.toString() ?? 'unknown',
      seq: (json['seq'] as num?)?.toInt() ?? -1,
      serverTs: (json['server_ts'] as num?)?.toInt() ??
          DateTime.now().millisecondsSinceEpoch ~/ 1000,
    );
  }
}
