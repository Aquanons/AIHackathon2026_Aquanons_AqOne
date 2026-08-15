import 'package:sqflite/sqflite.dart';

import '../models/checklist_item.dart';
import 'app_database.dart';

/// Local, unsynced store for the trip gear checklist.
///
/// Never leaves the phone - this is a personal packing list, not dispatcher
/// data, so unlike [CatchStore] there is no upload queue or sync state here.
class ChecklistStore {
  ChecklistStore(this._db);

  final AppDatabase _db;

  static const String _table = 'checklist_items';

  /// The default gear list a fresh install starts with. Only inserted once,
  /// the first time the checklist page loads and finds the table empty -
  /// after that, whatever the fisherman has added or removed is authoritative.
  static const List<String> _defaults = <String>[
    'Life jacket',
    'Flashlight',
    'Bailer',
    'Radio check',
    'First aid kit',
  ];

  Future<List<ChecklistItem>> all() async {
    final db = await _db.database;
    final rows = await db.query(_table, orderBy: 'sort_order ASC, id ASC');
    if (rows.isEmpty) {
      await _seedDefaults(db);
      final seeded = await db.query(_table, orderBy: 'sort_order ASC, id ASC');
      return seeded.map(ChecklistItem.fromRow).toList(growable: false);
    }
    return rows.map(ChecklistItem.fromRow).toList(growable: false);
  }

  Future<void> _seedDefaults(Database db) async {
    final now = DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000;
    final batch = db.batch();
    for (var i = 0; i < _defaults.length; i++) {
      batch.insert(_table, <String, Object?>{
        'title': _defaults[i],
        'is_done': 0,
        'sort_order': i,
        'created_at': now,
      });
    }
    await batch.commit(noResult: true);
  }

  Future<ChecklistItem> add(String title) async {
    final db = await _db.database;
    final maxOrder = Sqflite.firstIntValue(
          await db.rawQuery('SELECT MAX(sort_order) AS m FROM $_table'),
        ) ??
        -1;
    final now = DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000;
    final id = await db.insert(_table, <String, Object?>{
      'title': title,
      'is_done': 0,
      'sort_order': maxOrder + 1,
      'created_at': now,
    });
    return ChecklistItem(
      id: id,
      title: title,
      isDone: false,
      sortOrder: maxOrder + 1,
      createdAt: now,
    );
  }

  Future<void> setDone(int id, bool isDone) async {
    final db = await _db.database;
    await db.update(
      _table,
      <String, Object?>{'is_done': isDone ? 1 : 0},
      where: 'id = ?',
      whereArgs: <Object?>[id],
    );
  }

  Future<void> delete(int id) async {
    final db = await _db.database;
    await db.delete(_table, where: 'id = ?', whereArgs: <Object?>[id]);
  }

  /// Unchecks every item, ready for the next trip out. Deliberately never
  /// deletes rows - see [ChecklistItem]'s doc comment.
  Future<void> resetForNewTrip() async {
    final db = await _db.database;
    await db.update(_table, <String, Object?>{'is_done': 0});
  }
}
