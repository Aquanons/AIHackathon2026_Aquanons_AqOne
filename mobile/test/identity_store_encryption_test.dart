import 'dart:math';

import 'package:aqone/core/field_cipher.dart';
import 'package:aqone/data/app_database.dart';
import 'package:aqone/data/identity_store.dart';
import 'package:aqone/models/license_type.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Reads the raw `identity` rows, bypassing the store, so these tests assert
/// what is actually on disk rather than what the API returns.
Future<Map<String, String>> _rawRows(AppDatabase db) async {
  final Database handle = await db.database;
  final List<Map<String, Object?>> rows = await handle.query('identity');
  return <String, String>{
    for (final Map<String, Object?> row in rows)
      row['key'] as String: row['value'] as String,
  };
}

void main() {
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

  List<int> key(int seed) {
    final Random rng = Random(seed);
    return List<int>.generate(32, (_) => rng.nextInt(256), growable: false);
  }

  late AppDatabase db;

  setUp(() {
    db = AppDatabase(overridePath: inMemoryDatabasePath);
  });

  tearDown(() async {
    await db.close();
  });

  test('personal fields are ciphertext on disk, emergency fields are not',
      () async {
    final IdentityStore store =
        IdentityStore(db, cipher: FieldCipher.withKey(key(1)));

    await store.ensure(
      boat: 'BG-123',
      skipperName: 'Juan dela Cruz',
      licenseType: LicenseType.fishr,
      licenseNumber: 'FISHR-99887',
      phone: '09171234567',
    );

    final Map<String, String> raw = await _rawRows(db);

    // Personal data: unreadable without the key.
    expect(raw['skipper_name'], startsWith('enc:v1:'));
    expect(raw['license_number'], startsWith('enc:v1:'));
    expect(raw['phone'], startsWith('enc:v1:'));
    // Search for the NORMALISED number. Searching for what was typed would
    // pass even with encryption switched off, because the store rewrites
    // 09171234567 to +639171234567 before saving - a false pass in the one
    // test that is supposed to prove data is unreadable on disk.
    expect(raw.values.join(), isNot(contains('Juan')));
    expect(raw.values.join(), isNot(contains('+639171234567')));
    expect(raw.values.join(), isNot(contains('9171234567')));
    expect(raw.values.join(), isNot(contains('FISHR-99887')));

    // Emergency-critical: must stay readable even with no keystore, because
    // these identify the vessel to responders.
    expect(raw['boat'], 'BG-123');
    expect(raw['vessel_id'], isNotNull);
    expect(FieldCipher.looksEncrypted(raw['vessel_id']), isFalse);
    expect(FieldCipher.looksEncrypted(raw['boat']), isFalse);
  });

  test('round trips through the store', () async {
    final IdentityStore store =
        IdentityStore(db, cipher: FieldCipher.withKey(key(2)));

    await store.ensure(
      boat: 'BG-123',
      skipperName: 'Juan dela Cruz',
      licenseType: LicenseType.fishr,
      licenseNumber: 'FISHR-99887',
      phone: '09171234567',
    );

    final identity = await store.read();
    expect(identity!.skipperName, 'Juan dela Cruz');
    expect(identity.licenseNumber, 'FISHR-99887');
    // ensure() runs Validators.normalizePhone, so 09XXXXXXXXX is stored as
    // E.164 before it is ever encrypted. Asserting the normalised form is the
    // point: it proves the value survived encrypt -> disk -> decrypt intact,
    // rather than proving what was typed.
    expect(identity.phone, '+639171234567');
    expect(identity.boat, 'BG-123');
  });

  test('rows written before Phase 5 still read back', () async {
    // The migration story: a store with no cipher writes plaintext, and a
    // later store with a key must not choke on it. No sweep, no corruption.
    final IdentityStore legacy = IdentityStore(db);
    await legacy.ensure(
      boat: 'BG-123',
      skipperName: 'Maria Santos',
      licenseType: LicenseType.fishr,
      licenseNumber: 'FISHR-11111',
      phone: '09990001111',
    );

    final IdentityStore upgraded =
        IdentityStore(db, cipher: FieldCipher.withKey(key(3)));
    final identity = await upgraded.read();

    expect(identity!.skipperName, 'Maria Santos');
    expect(identity.phone, '+639990001111');
  });

  test('a lost key costs the name, never the vessel identity', () async {
    final IdentityStore before =
        IdentityStore(db, cipher: FieldCipher.withKey(key(4)));
    await before.ensure(
      boat: 'BG-123',
      skipperName: 'Juan dela Cruz',
      licenseType: LicenseType.fishr,
      licenseNumber: 'FISHR-99887',
      phone: '09171234567',
    );

    // Keystore wiped by a device restore.
    final IdentityStore after = IdentityStore(db);
    final identity = await after.read();

    // The point of the whole design: the vessel is still identifiable to a
    // responder, and the fisherman retypes his name.
    expect(identity, isNotNull);
    expect(identity!.boat, 'BG-123');
    expect(identity.vesselId, isNotEmpty);
    expect(identity.skipperName, '');
    expect(identity.phone, '');
  });
}
