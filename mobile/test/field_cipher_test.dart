import 'dart:math';

import 'package:aqone/core/field_cipher.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  List<int> key(int seed) {
    final Random rng = Random(seed);
    return List<int>.generate(32, (_) => rng.nextInt(256), growable: false);
  }

  group('round trip', () {
    test('encrypts and decrypts a value', () async {
      final FieldCipher cipher = FieldCipher.withKey(key(1));
      final String sealed = await cipher.encrypt('Juan dela Cruz');

      expect(sealed, startsWith('enc:v1:'));
      expect(sealed, isNot(contains('Juan')));
      expect(await cipher.decrypt(sealed), 'Juan dela Cruz');
    });

    test('two encryptions of the same value differ', () async {
      // A fresh nonce each time. Deterministic ciphertext would let anyone
      // with the database tell that two fishers share a phone number.
      final FieldCipher cipher = FieldCipher.withKey(key(2));
      final String a = await cipher.encrypt('09171234567');
      final String b = await cipher.encrypt('09171234567');

      expect(a, isNot(b));
      expect(await cipher.decrypt(a), await cipher.decrypt(b));
    });

    test('survives non-ASCII', () async {
      final FieldCipher cipher = FieldCipher.withKey(key(3));
      const String name = 'Peñaflor Ñoño';
      expect(await cipher.decrypt(await cipher.encrypt(name)), name);
    });
  });

  group('migration safety', () {
    test('legacy plaintext reads back unchanged', () async {
      // The whole migration strategy: no sweep over the database, so no
      // half-finished sweep can corrupt it. Rows written before Phase 5 are
      // simply returned as they are.
      final FieldCipher cipher = FieldCipher.withKey(key(4));
      expect(await cipher.decrypt('Juan dela Cruz'), 'Juan dela Cruz');
      expect(await cipher.decrypt(''), '');
    });

    test('empty values are not encrypted', () async {
      final FieldCipher cipher = FieldCipher.withKey(key(5));
      expect(await cipher.encrypt(''), '');
    });
  });

  group('availability', () {
    test('with no key, writes stay plaintext and reads still work', () async {
      // The keystore was unavailable. Constraint 1 of the security plan says
      // the app must still work, so this degrades rather than fails.
      final FieldCipher cipher = FieldCipher.plaintext();

      expect(cipher.isEnabled, isFalse);
      expect(await cipher.encrypt('Juan'), 'Juan');
      expect(await cipher.decrypt('Juan'), 'Juan');
    });

    test('an undecryptable value yields empty, never raw ciphertext', () async {
      final String sealed = await FieldCipher.withKey(key(6)).encrypt('Juan');

      // Wrong key - a restored phone, a rotated keystore.
      expect(await FieldCipher.withKey(key(7)).decrypt(sealed), '');
      // No key at all.
      expect(await FieldCipher.plaintext().decrypt(sealed), '');
      // Tampered.
      expect(await FieldCipher.withKey(key(6)).decrypt('enc:v1:not-base64'), '');
    });

    test('a wrong-length key disables encryption rather than guessing', () async {
      final FieldCipher cipher = FieldCipher.withKey(<int>[1, 2, 3]);
      expect(cipher.isEnabled, isFalse);
      expect(await cipher.encrypt('Juan'), 'Juan');
    });
  });

  group('looksEncrypted', () {
    test('recognises only its own format', () {
      expect(FieldCipher.looksEncrypted('enc:v1:abc'), isTrue);
      expect(FieldCipher.looksEncrypted('Juan dela Cruz'), isFalse);
      expect(FieldCipher.looksEncrypted(null), isFalse);
      expect(FieldCipher.looksEncrypted(''), isFalse);
    });
  });
}
