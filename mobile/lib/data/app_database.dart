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
      version: 6,
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
        if (oldVersion < 5) {
          // v5 stores what the responder sent back, so the ETA survives the
          // app being closed and reopened - which is exactly when a frightened
          // person will check it.
          await _addResponderColumns(db);
        }
        if (oldVersion < 6) {
          // v6: buoy_id is the firmware's BUOY_ID string (e.g. "BUOY01"), not
          // a numeric id - see docs/21_WEEK1_CONTRACT_FIXTURES.md. No column
          // migration is needed: SQLite's INTEGER-affinity storage already
          // accepts and round-trips TEXT values for a column that was never
          // declared STRICT, and SosRecord.fromRow() reads whatever is there
          // with toString(). This upgrade step exists only to document the
          // version bump and the reasoning, so a future migration does not
          // assume buoy_id is still numeric.
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
            -- The firmware's BUOY_ID string (e.g. "BUOY01"), not numeric -
            -- see docs/21_WEEK1_CONTRACT_FIXTURES.md.
            buoy_id         TEXT,
            src_id          INTEGER,
            seq             INTEGER,
            server_ts       INTEGER,
            attempts        INTEGER NOT NULL DEFAULT 0,
            last_error      TEXT,
            relayed_at      INTEGER,
            delivered_at    INTEGER,
            acknowledged_at INTEGER,
            acked_by        TEXT,
            -- What the responder sent back. remote_id is the backend's event
            -- id, needed to post the fisher's reply against the right incident.
            remote_id        TEXT,
            eta_at           TEXT,
            responder_status INTEGER,
            responder_note   TEXT,
            fisher_reply     INTEGER
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
  /// Columns added in v5 for the responder loop.
  ///
  /// Applied one at a time and tolerantly: SQLite has no ADD COLUMN IF NOT
  /// EXISTS, and a handset that has already been through a partial upgrade
  /// must not be left with an unopenable database mid-emergency.
  static Future<void> _addResponderColumns(Database db) async {
    const columns = <String>[
      'remote_id TEXT',
      'eta_at TEXT',
      'responder_status INTEGER',
      'responder_note TEXT',
      'fisher_reply INTEGER',
    ];
    for (final column in columns) {
      try {
        await db.execute('ALTER TABLE outbox ADD COLUMN $column');
      } catch (_) {
        // Already present.
      }
    }
  }

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
