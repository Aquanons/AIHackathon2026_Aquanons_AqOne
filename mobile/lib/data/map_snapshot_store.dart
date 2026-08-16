import 'package:sqflite/sqflite.dart';

import 'app_database.dart';

/// The last good response for each map feed, kept so the Venture map is
/// usable with no signal.
///
/// The app already keeps the last response in memory, which covers losing
/// signal while the screen is open. It does nothing for the case that
/// actually happens: a fisherman closes the app at the dock and opens it two
/// hours offshore, to an empty sea with no buoys and no coverage circles.
///
/// Snapshots are advisory, never authoritative. Everything read back from
/// here is stamped with its age at the point of display - a three-hour-old
/// hazard picture must not be mistaken for a live one.
class MapSnapshotStore {
  MapSnapshotStore(this._db);

  final AppDatabase _db;

  static const String _table = 'map_snapshot';

  /// Feed keys. Stable strings rather than an enum: they are a storage
  /// contract, and renaming a Dart identifier should not orphan a row.
  static const String feedBuoys = 'buoys';
  static const String feedWaveAlerts = 'alerts_wave';
  static const String feedCapsizeAlerts = 'alerts_capsize';
  static const String feedSeaCondition = 'sea_condition';
  static const String feedAdvisories = 'advisories';
  static const String feedHotspots = 'hotspots';

  /// Anything older than this is not served at all.
  ///
  /// A stale buoy position is still useful - moorings do not move. A stale
  /// hazard alert is actively dangerous, so the caller narrows this further
  /// for those feeds; see [maxAgeFor].
  static const Duration defaultMaxAge = Duration(days: 7);

  /// Hazard alerts describe a condition happening now. Beyond a few hours
  /// they say nothing about the present, and showing them would imply
  /// otherwise.
  static const Duration hazardMaxAge = Duration(hours: 6);

  static Duration maxAgeFor(String feed) {
    switch (feed) {
      case feedWaveAlerts:
      case feedCapsizeAlerts:
      case feedSeaCondition:
        return hazardMaxAge;
      default:
        return defaultMaxAge;
    }
  }

  Future<void> save(String feed, String payload) async {
    try {
      final Database db = await _db.database;
      await db.insert(
        _table,
        <String, Object?>{
          'feed': feed,
          'payload': payload,
          'fetched_at': DateTime.now().millisecondsSinceEpoch,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    } catch (_) {
      // A failed snapshot write must never break a successful fetch. The
      // user has live data on screen; losing the cached copy is invisible
      // to them and not worth an error path.
    }
  }

  /// Returns null when nothing is stored, or when what is stored is older
  /// than [maxAgeFor] allows.
  Future<MapSnapshot?> load(String feed) async {
    try {
      final Database db = await _db.database;
      final List<Map<String, Object?>> rows = await db.query(
        _table,
        where: 'feed = ?',
        whereArgs: <Object?>[feed],
        limit: 1,
      );
      if (rows.isEmpty) {
        return null;
      }
      final Object? payload = rows.first['payload'];
      final Object? at = rows.first['fetched_at'];
      if (payload is! String || at is! int) {
        return null;
      }
      final DateTime fetchedAt = DateTime.fromMillisecondsSinceEpoch(at);
      if (DateTime.now().difference(fetchedAt) > maxAgeFor(feed)) {
        return null;
      }
      return MapSnapshot(payload: payload, fetchedAt: fetchedAt);
    } catch (_) {
      return null;
    }
  }

  /// Age of every stored feed, for the offline banner. Expired rows are
  /// excluded, so the banner never advertises data the map will not draw.
  Future<Map<String, DateTime>> ages() async {
    try {
      final Database db = await _db.database;
      final List<Map<String, Object?>> rows =
          await db.query(_table, columns: <String>['feed', 'fetched_at']);
      final Map<String, DateTime> out = <String, DateTime>{};
      final DateTime now = DateTime.now();
      for (final Map<String, Object?> row in rows) {
        final Object? feed = row['feed'];
        final Object? at = row['fetched_at'];
        if (feed is! String || at is! int) {
          continue;
        }
        final DateTime fetchedAt = DateTime.fromMillisecondsSinceEpoch(at);
        if (now.difference(fetchedAt) <= maxAgeFor(feed)) {
          out[feed] = fetchedAt;
        }
      }
      return out;
    } catch (_) {
      return const <String, DateTime>{};
    }
  }

  Future<void> clear() async {
    try {
      final Database db = await _db.database;
      await db.delete(_table);
    } catch (_) {}
  }
}

class MapSnapshot {
  const MapSnapshot({required this.payload, required this.fetchedAt});

  /// The response body exactly as it arrived, for the model to re-parse.
  final String payload;
  final DateTime fetchedAt;

  Duration get age => DateTime.now().difference(fetchedAt);
}
