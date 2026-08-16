import 'dart:convert';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Keystore/Keychain-backed storage for the vessel device credential and the
/// key used to encrypt sensitive local fields.
///
/// Phase 5 of `docs/25_MOBILE_SECURITY_IMPLEMENTATION_PLAN.md`. Two secrets
/// live here and nowhere else:
///
///  * the vessel bearer token issued by `/api/vessel-auth/enroll`, which
///    before this existed was held in memory only and lost on every restart;
///  * the data-encryption key (DEK) used by [FieldCipher] for personal fields
///    in the local database.
///
/// ## The availability rule that shapes this class
///
/// Non-negotiable constraint 1 of the plan: a fisherman must be able to queue
/// and hand off an SOS in airplane mode. Android Keystore can become
/// unreadable - device restore to new hardware, a lock-screen credential
/// change on some OEMs, or a corrupted keystore - and iOS Keychain items can
/// be absent after a restore.
///
/// So every read here returns null rather than throwing, and nothing in the
/// SOS path may depend on a value from this class. Losing the DEK costs the
/// skipper's name and phone number, which he can retype. It must never cost a
/// queued distress message.
class SecureCredentialStore {
  SecureCredentialStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(
                // Backed by the Android Keystore rather than plain
                // SharedPreferences. Phase 2 disabled Android backup for the
                // app's data; this keeps the credential out of reach even
                // with filesystem access to app-private storage.
                encryptedSharedPreferences: true,
              ),
              iOptions: IOSOptions(
                // Not synced to iCloud, and unavailable until the device has
                // been unlocked once after boot. first_unlock rather than
                // ...ThisDeviceOnly's stricter variants because background
                // outbox flushes must still be able to read the token.
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  final FlutterSecureStorage _storage;

  static const String _keyVesselToken = 'aqone_vessel_token';
  static const String _keyDeviceId = 'aqone_device_id';
  static const String _keyFieldKey = 'aqone_field_key_v1';

  /// Reads a value, treating any platform failure as absent.
  ///
  /// Deliberately swallowing: a Keystore that cannot be read is a degraded
  /// app, not a broken one, and the alternative is an exception on a startup
  /// path that must always reach the SOS button.
  Future<String?> _read(String key) async {
    try {
      final String? value = await _storage.read(key: key);
      if (value == null || value.isEmpty) {
        return null;
      }
      return value;
    } catch (_) {
      return null;
    }
  }

  Future<bool> _write(String key, String value) async {
    try {
      await _storage.write(key: key, value: value);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _delete(String key) async {
    try {
      await _storage.delete(key: key);
    } catch (_) {}
  }

  // --- Vessel device credential ---------------------------------------------

  Future<String?> readVesselToken() => _read(_keyVesselToken);

  /// Returns false when the platform refused to store it. The caller keeps the
  /// token in memory for this session rather than failing the enrolment - a
  /// working authenticated session that does not survive restart beats no
  /// session at all.
  Future<bool> writeVesselToken(String token) =>
      _write(_keyVesselToken, token);

  Future<String?> readDeviceId() => _read(_keyDeviceId);

  Future<bool> writeDeviceId(String deviceId) =>
      _write(_keyDeviceId, deviceId);

  /// Device-loss and revocation path.
  ///
  /// Clears the credential and the device id but **keeps the DEK**, so
  /// previously encrypted local fields remain readable to the fisherman who
  /// still holds the phone. Revoking a device server-side is about stopping
  /// it talking to the backend, not about destroying the owner's own data.
  /// See [forgetEverything] for the destructive case.
  Future<void> clearVesselCredential() async {
    await _delete(_keyVesselToken);
    await _delete(_keyDeviceId);
  }

  /// Full local wipe, including the DEK.
  ///
  /// After this, fields encrypted with the old key are unrecoverable by
  /// design. The SOS outbox is unaffected: it is never encrypted, precisely
  /// so this operation can never destroy a queued emergency.
  Future<void> forgetEverything() async {
    await clearVesselCredential();
    await _delete(_keyFieldKey);
  }

  // --- Field-encryption key --------------------------------------------------

  /// Returns the DEK, creating one on first use.
  ///
  /// Null means the platform store is unavailable. Callers must then fall
  /// back to plaintext rather than refusing to work - see [FieldCipher].
  Future<List<int>?> readOrCreateFieldKey() async {
    final String? existing = await _read(_keyFieldKey);
    if (existing != null) {
      try {
        final List<int> bytes = base64Decode(existing);
        if (bytes.length == 32) {
          return bytes;
        }
        // Wrong length means something else wrote this key. Refusing to use
        // it is safer than silently deriving from garbage.
        return null;
      } catch (_) {
        return null;
      }
    }

    final Random rng = Random.secure();
    final List<int> key =
        List<int>.generate(32, (_) => rng.nextInt(256), growable: false);
    final bool stored = await _write(_keyFieldKey, base64Encode(key));
    if (!stored) {
      // Could not persist it. Returning null keeps writes in plaintext rather
      // than encrypting with a key that will be gone next launch, which would
      // turn the fisherman's own profile into unreadable ciphertext.
      return null;
    }
    return key;
  }

  Future<bool> get hasFieldKey async => (await _read(_keyFieldKey)) != null;
}
