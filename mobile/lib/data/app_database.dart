import 'package:sqflite/sqflite.dart';

import 'db_factory.dart';

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
    initDatabaseFactory();
    final path = _overridePath ?? await defaultDatabasePath('aqone_outbox.db');
    return openDatabase(
      path,
      version: 4,
      onConfigure: (db) => db.execute('PRAGMA foreign_keys = ON'),
      onUpgrade: (db, oldVersion, newVersion) async {
        // Each step is wrapped in try/catch so a partially-applied migration
        // (e.g. column already added on a previous crash) doesn't kill the
        // entire openDatabase call.
        if (oldVersion < 2) {
          try {
            await db.execute(
              'ALTER TABLE outbox ADD COLUMN trust_tier TEXT NOT NULL '
              "DEFAULT 'self_declared'",
            );
          } catch (_) {}
        }
        if (oldVersion < 3) {
          await _createLegacyOutbox(db);
        }
        if (oldVersion < 4) {
          await db.execute('DROP TABLE IF EXISTS catch_outbox');
        }
      },
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
            trust_tier      TEXT NOT NULL DEFAULT 'self_declared',
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

  /// Legacy outbox rows get their own table rather than sharing [outbox].
  ///
  /// They travel a different route - straight to the backend over HTTP when
  /// signal returns, never over LoRa - and carry entirely different columns.
  /// Folding them into the SOS outbox would mean a dozen nullable columns and
  /// a state machine that means two different things depending on the row.
  static Future<void> _createLegacyOutbox(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS catch_outbox (
        local_id     TEXT PRIMARY KEY,
        vessel_id    TEXT NOT NULL,
        species_name TEXT,
        quantity_kg  REAL NOT NULL,
        catch_date   TEXT NOT NULL,
        client_ts    INTEGER NOT NULL,
        state        TEXT NOT NULL,
        lat          REAL,
        lon          REAL,
        method       TEXT,
        notes        TEXT,
        attempts     INTEGER NOT NULL DEFAULT 0,
        last_error   TEXT,
        server_id    TEXT,
        synced_at    INTEGER
      )
    ''');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_catch_state '
      'ON catch_outbox (state, client_ts DESC)',
    );
  }

  Future<void> close() async {
    await _database?.close();
    _database = null;
  }
}
