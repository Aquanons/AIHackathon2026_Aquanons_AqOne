import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

/// AES-GCM encryption for individual sensitive fields in the local database.
///
/// Phase 5 of `docs/25_MOBILE_SECURITY_IMPLEMENTATION_PLAN.md` chose field
/// encryption over whole-database encryption, and the reason is the plan's own
/// hard stop: if encryption can break SOS queue creation, offline startup or
/// recovery after an app update, it must not ship. A SQLCipher database keyed
/// from the Keystore takes the SOS outbox down with the key. This does not -
/// emergency-critical columns (`vessel_id`, `boat`, every outbox row) are
/// never encrypted, so a lost key costs a name and a phone number, not a
/// distress message.
///
/// ## Format
///
/// `enc:v1:<base64(nonce|ciphertext|mac)>`
///
/// The prefix is what makes the migration safe. There is no migration step:
/// [decrypt] returns any value lacking the prefix unchanged, so existing
/// plaintext rows keep working and are re-written encrypted the next time
/// they are saved. Nothing has to sweep the database, so nothing can corrupt
/// it half way through.
class FieldCipher {
  FieldCipher._(this._key);

  /// Null key means no encryption is available - the platform store was
  /// unreadable. Reads still work (plaintext passes through, and previously
  /// encrypted values simply cannot be read), and writes stay plaintext. A
  /// degraded app, never a broken one.
  static FieldCipher plaintext() => FieldCipher._(null);

  static FieldCipher withKey(List<int> key) {
    if (key.length != 32) {
      return FieldCipher._(null);
    }
    return FieldCipher._(SecretKey(key));
  }

  final SecretKey? _key;

  static const String _prefix = 'enc:v1:';

  static final AesGcm _algorithm = AesGcm.with256bits();

  bool get isEnabled => _key != null;

  /// True if [value] is ciphertext this class wrote.
  static bool looksEncrypted(String? value) =>
      value != null && value.startsWith(_prefix);

  /// Encrypts [value], or returns it unchanged when no key is available.
  ///
  /// Empty strings are passed through: encrypting "" produces ciphertext that
  /// is longer than the value it protects and leaks that the field is set.
  Future<String> encrypt(String value) async {
    final SecretKey? key = _key;
    if (key == null || value.isEmpty) {
      return value;
    }
    try {
      final Random rng = Random.secure();
      final List<int> nonce =
          List<int>.generate(12, (_) => rng.nextInt(256), growable: false);
      final SecretBox box = await _algorithm.encrypt(
        utf8.encode(value),
        secretKey: key,
        nonce: nonce,
      );
      final Uint8List packed = Uint8List.fromList(<int>[
        ...box.nonce,
        ...box.cipherText,
        ...box.mac.bytes,
      ]);
      return '$_prefix${base64Encode(packed)}';
    } catch (_) {
      // Never fail a save because encryption failed. The fisherman's profile
      // edit must land; the worst case is that this field stays plaintext,
      // which is exactly where it was before this phase.
      return value;
    }
  }

  /// Decrypts a value written by [encrypt].
  ///
  /// Returns plaintext input unchanged, which is what makes legacy rows and a
  /// key-loss situation survivable. Returns an empty string when a value is
  /// encrypted but undecryptable - the field is gone, and showing raw
  /// ciphertext to a fisherman would be worse than showing nothing.
  Future<String> decrypt(String value) async {
    if (!looksEncrypted(value)) {
      return value;
    }
    final SecretKey? key = _key;
    if (key == null) {
      return '';
    }
    try {
      final Uint8List packed = base64Decode(value.substring(_prefix.length));
      if (packed.length < 12 + 16) {
        return '';
      }
      final SecretBox box = SecretBox(
        packed.sublist(12, packed.length - 16),
        nonce: packed.sublist(0, 12),
        mac: Mac(packed.sublist(packed.length - 16)),
      );
      final List<int> clear = await _algorithm.decrypt(box, secretKey: key);
      return utf8.decode(clear);
    } catch (_) {
      // Wrong key, tampered row, or truncated value. All three mean the same
      // thing to the caller: this field is not readable.
      return '';
    }
  }
}
