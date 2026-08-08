import '../models/license_type.dart';
import 'config.dart';

/// Format-only checks for the details collected at registration.
///
/// None of this verifies anything. There is no public BFAR or LGU lookup, and
/// the app is built to work with no internet at all, so the most the handset
/// can do is reject obvious typos and normalise what it stores. These rules
/// are deliberately lenient: wrongly rejecting a real fisherman is a far worse
/// outcome than accepting a made-up number we never claimed to have checked.
class Validators {
  const Validators._();

  static final RegExp _licenceAllowed = RegExp(r'^[A-Z0-9\-/]+$');
  static final RegExp _digit = RegExp(r'[0-9]');
  static final RegExp _nonDigit = RegExp(r'[^0-9]');
  static final RegExp _letter = RegExp('[A-Za-z]');

  /// Uppercased, whitespace-collapsed licence number.
  static String normalizeLicense(String value) {
    return value.trim().toUpperCase().replaceAll(RegExp(r'\s+'), '');
  }

  /// Collapses runs of whitespace so 'Juan   Dela  Cruz' stores cleanly.
  static String normalizeName(String value) {
    return value.trim().replaceAll(RegExp(r'\s+'), ' ');
  }

  /// Philippine mobile numbers, stored as +639XXXXXXXXX.
  ///
  /// Accepts 09XXXXXXXXX, 639XXXXXXXXX and +639XXXXXXXXX, with any spaces,
  /// dashes or brackets the user felt like adding. Returns an empty string if
  /// the input is not recognisable, so callers should validate first.
  static String normalizePhone(String value) {
    final digits = value.replaceAll(_nonDigit, '');
    if (digits.length == 11 && digits.startsWith('09')) {
      return '+63${digits.substring(1)}';
    }
    if (digits.length == 12 && digits.startsWith('639')) {
      return '+$digits';
    }
    if (digits.length == 10 && digits.startsWith('9')) {
      return '+63$digits';
    }
    return '';
  }

  static String? skipperName(String? value) {
    final name = normalizeName(value ?? '');
    if (name.isEmpty) {
      return 'Please enter your full name';
    }
    if (name.length < 2) {
      return 'That name looks too short';
    }
    if (name.length > AqOneConfig.maxNameLength) {
      return 'Please keep this under ${AqOneConfig.maxNameLength} characters';
    }
    if (!_letter.hasMatch(name)) {
      return 'Please enter your name, not a number';
    }
    return null;
  }

  static String? boatName(String? value) {
    final boat = normalizeName(value ?? '');
    if (boat.isEmpty) {
      return 'Please enter your boat name';
    }
    if (boat.length > AqOneConfig.maxBoatLength) {
      return 'Please keep this under ${AqOneConfig.maxBoatLength} characters';
    }
    return null;
  }

  static String? phone(String? value) {
    final raw = (value ?? '').trim();
    if (raw.isEmpty) {
      return 'Please enter a mobile number';
    }
    if (normalizePhone(raw).isEmpty) {
      return 'Enter a PH mobile number, e.g. 0912 345 6789';
    }
    return null;
  }

  /// Lenient shape check for a registration number.
  ///
  /// FishR numbers are numeric; BoatR and CFVGL references vary by office and
  /// by year, so anything alphanumeric of a plausible length is accepted.
  static String? license(String? value, LicenseType type) {
    if (!type.requiresNumber) {
      return null;
    }
    final number = normalizeLicense(value ?? '');
    if (number.isEmpty) {
      return 'Enter your ${type.label} number, or choose '
          '"${LicenseType.none.label}"';
    }
    if (number.length < AqOneConfig.minLicenseLength) {
      return 'That ${type.label} number looks too short';
    }
    if (number.length > AqOneConfig.maxLicenseLength) {
      return 'That ${type.label} number looks too long';
    }
    if (!_licenceAllowed.hasMatch(number)) {
      return 'Use letters, numbers and dashes only';
    }
    if (!_digit.hasMatch(number)) {
      return 'A ${type.label} number contains at least one digit';
    }
    if (type == LicenseType.fishr && _letter.hasMatch(number)) {
      return 'FishR numbers are digits only';
    }
    return null;
  }
}
