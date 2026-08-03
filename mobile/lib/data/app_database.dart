import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

class AppDatabase {
  AppDatabase({String? overridePath}) : _overridePath = overridePath;

  final String? _overridePath;
  Database? _database;

  Future<Database> get database async {
    final existing = _database;
    if (existing != null) {
      return existing;
    }
    final opened = await _open();
    _database = opened;
    return opened;
  }

  Future<Database> _open() async {
    final path = _overridePath ??
        p.join(await getDatabasesPath(), 'aqone_outbox.db');
    return openDatabase(
      path,
      version: 1,
      onConfigure: (db) => db.execute('PRAGMA foreign_keys = ON'),
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE identity (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE outbox (
            local_id        TEXT PRIMARY KEY,
            vessel_id       TEXT NOT NULL,
            boat            TEXT NOT NULL,
            client_ts       INTEGER NOT NULL,
            state           TEXT NOT NULL,
            lat             REAL,
            lon             REAL,
            note            TEXT,
            buoy_id         INTEGER,
            src_id          INTEGER,
            seq             INTEGER,
            server_ts       INTEGER,
            attempts        INTEGER NOT NULL DEFAULT 0,
            last_error      TEXT,
            relayed_at      INTEGER,
            delivered_at    INTEGER,
            acknowledged_at INTEGER,
            acked_by        TEXT
          )
        ''');
        await db.execute(
          'CREATE INDEX idx_outbox_state ON outbox (state, client_ts DESC)',
        );
        await db.execute(
          'CREATE INDEX idx_outbox_seq ON outbox (vessel_id, seq)',
        );
      },
    );
  }

  Future<void> close() async {
    await _database?.close();
    _database = null;
  }
}
