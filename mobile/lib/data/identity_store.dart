import 'dart:math';

import 'package:sqflite/sqflite.dart';

import '../core/config.dart';
import 'app_database.dart';

class VesselIdentity {
  const VesselIdentity({required this.vesselId, required this.boat});

  final String vesselId;
  final String boat;

  bool get isComplete => vesselId.isNotEmpty && boat.isNotEmpty;
}

class IdentityStore {
  IdentityStore(this._db);

  final AppDatabase _db;

  static const String _keyVesselId = 'vessel_id';
  static const String _keyBoat = 'boat';

  Future<VesselIdentity?> read() async {
    final db = await _db.database;
    final rows = await db.query('identity');
    if (rows.isEmpty) {
      return null;
    }
    final values = <String, String>{
      for (final row in rows) row['key'] as String: row['value'] as String,
    };
    final vesselId = values[_keyVesselId];
    final boat = values[_keyBoat];
    if (vesselId == null || boat == null) {
      return null;
    }
    return VesselIdentity(vesselId: vesselId, boat: boat);
  }

  Future<VesselIdentity> ensure({required String boat}) async {
    final existing = await read();
    final vesselId = existing?.vesselId ?? generateVesselId();
    final identity = VesselIdentity(
      vesselId: vesselId,
      boat: _clampBoat(boat),
    );
    await _write(identity);
    return identity;
  }

  Future<void> updateBoat(String boat) async {
    final existing = await read();
    if (existing == null) {
      await ensure(boat: boat);
      return;
    }
    await _write(
      VesselIdentity(vesselId: existing.vesselId, boat: _clampBoat(boat)),
    );
  }

  Future<void> _write(VesselIdentity identity) async {
    final db = await _db.database;
    final batch = db.batch();
    batch.insert(
      'identity',
      <String, Object?>{'key': _keyVesselId, 'value': identity.vesselId},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    batch.insert(
      'identity',
      <String, Object?>{'key': _keyBoat, 'value': identity.boat},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    await batch.commit(noResult: true);
  }

  static String _clampBoat(String boat) {
    final trimmed = boat.trim();
    return trimmed.length <= AqOneConfig.maxBoatLength
        ? trimmed
        : trimmed.substring(0, AqOneConfig.maxBoatLength);
  }

  static String generateVesselId() {
    final random = Random.secure();
    final buffer = StringBuffer();
    for (var i = 0; i < AqOneConfig.maxVesselIdLength; i++) {
      buffer.write(random.nextInt(16).toRadixString(16));
    }
    return buffer.toString();
  }
}
