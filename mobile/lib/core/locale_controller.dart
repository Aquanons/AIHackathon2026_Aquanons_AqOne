import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_diagnostics.dart';
import 'l10n_fallback.dart';

/// Holds the app's active locale and remembers an explicit choice.
///
/// Three states, and the difference between the last two matters:
///
/// * [override] is null - follow the device locale. A phone set to Filipino
///   gets a Filipino app without anyone touching a setting.
/// * [override] is set - the user picked a language and that wins over the
///   device, permanently, across restarts.
///
/// Deliberately backed by `shared_preferences` rather than the sqflite
/// database used for identity and the SOS outbox. The language choice is
/// needed to build the very first frame, and blocking startup on opening the
/// database - which `main.dart` already treats as failable - would mean a
/// database problem could leave the app with no language at all.
class LocaleController extends ChangeNotifier {
  LocaleController._(this._override);

  static const String _prefsKey = 'aqone.locale';

  Locale? _override;

  /// The language the user explicitly picked, or null if following the device.
  Locale? get override => _override;

  /// Whether the user has ever made an explicit choice.
  ///
  /// Onboarding uses this to decide whether to surface the language picker
  /// prominently on first launch.
  bool get hasExplicitChoice => _override != null;

  /// The locale to hand to `MaterialApp.locale`.
  ///
  /// Null means "let Flutter resolve from the device", which is the correct
  /// default rather than resolving it ourselves - Flutter's resolution also
  /// considers the full ordered list of the user's preferred languages, not
  /// just the first one.
  Locale? get locale => _override;

  /// Load the stored choice. Never throws: a preferences failure degrades to
  /// device-locale behaviour rather than blocking launch.
  static Future<LocaleController> load() async {
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      final String? stored = prefs.getString(_prefsKey);
      if (stored == null || stored.isEmpty) {
        return LocaleController._(null);
      }
      final Locale candidate = Locale(stored);
      final bool known = kSupportedLocales.any(
        (Locale l) => l.languageCode == candidate.languageCode,
      );
      return LocaleController._(known ? candidate : null);
    } catch (e) {
      AppDiagnostics.log('locale-load', e);
      return LocaleController._(null);
    }
  }

  /// Set an explicit language. Pass null to go back to following the device.
  Future<void> setLocale(Locale? locale) async {
    if (locale?.languageCode == _override?.languageCode) {
      return;
    }
    _override = locale;
    notifyListeners();
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      if (locale == null) {
        await prefs.remove(_prefsKey);
      } else {
        await prefs.setString(_prefsKey, locale.languageCode);
      }
    } catch (e) {
      // The in-memory switch already happened, so the user sees the language
      // change; it just will not survive a restart.
      AppDiagnostics.log('locale-save', e);
    }
  }

  /// The locale actually in effect, resolving the device locale when the user
  /// has not chosen one. For UI that needs to show which language is active.
  Locale effectiveLocale(BuildContext context) =>
      _override ??
      resolveLocale(Localizations.localeOf(context), kSupportedLocales);
}
