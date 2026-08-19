import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

/// Locales the app ships translations for.
///
/// `fil` rather than `tl`: `flutter_localizations` ships
/// `GlobalMaterialLocalizations` for `fil` and not for `tl`, and listing a
/// locale the global delegates cannot load throws
/// "No MaterialLocalizations found" the first time any Material widget with
/// built-in copy is built - a date picker, a text-selection menu, a tooltip.
const List<Locale> kSupportedLocales = <Locale>[
  Locale('en'),
  Locale('fil'),
  Locale('akl'),
];

/// Aklanon (`akl`) has no CLDR data in `flutter_localizations`, so the global
/// delegates reject it. These fallbacks claim every locale and load the
/// English implementations instead.
///
/// They must be listed *after* the global delegates: Flutter resolves
/// delegates in order and takes the first that reports `isSupported`, so
/// `en` and `fil` still get their real localizations and only `akl` reaches
/// these. Our own `AppLocalizations` resolves `akl` properly - the fallback
/// only affects Flutter's built-in widget chrome, which will read English in
/// Aklanon mode. That is the accepted trade-off recorded in §4.2 of
/// `docs/22_LOCALIZATION_PLAN.md`.
const List<LocalizationsDelegate<dynamic>> kFallbackDelegates =
    <LocalizationsDelegate<dynamic>>[
  _FallbackMaterialDelegate(),
  _FallbackCupertinoDelegate(),
  _FallbackWidgetsDelegate(),
];

/// Resolve a device locale against [kSupportedLocales], matching on language
/// code alone so `fil_PH` and `en_US` both resolve.
///
/// Android reports Filipino as `fil` on modern versions but some devices and
/// some older webviews still report the deprecated `tl`; both are mapped to
/// `fil` here so a phone set to Tagalog gets a Tagalog app.
Locale resolveLocale(Locale? device, Iterable<Locale> supported) {
  if (device == null) {
    return const Locale('en');
  }
  final String code = device.languageCode == 'tl' ? 'fil' : device.languageCode;
  for (final Locale locale in supported) {
    if (locale.languageCode == code) {
      return locale;
    }
  }
  return const Locale('en');
}

class _FallbackMaterialDelegate
    extends LocalizationsDelegate<MaterialLocalizations> {
  const _FallbackMaterialDelegate();

  @override
  bool isSupported(Locale locale) => true;

  @override
  Future<MaterialLocalizations> load(Locale locale) =>
      GlobalMaterialLocalizations.delegate.load(const Locale('en'));

  @override
  bool shouldReload(_FallbackMaterialDelegate old) => false;
}

class _FallbackCupertinoDelegate
    extends LocalizationsDelegate<CupertinoLocalizations> {
  const _FallbackCupertinoDelegate();

  @override
  bool isSupported(Locale locale) => true;

  @override
  Future<CupertinoLocalizations> load(Locale locale) =>
      GlobalCupertinoLocalizations.delegate.load(const Locale('en'));

  @override
  bool shouldReload(_FallbackCupertinoDelegate old) => false;
}

class _FallbackWidgetsDelegate
    extends LocalizationsDelegate<WidgetsLocalizations> {
  const _FallbackWidgetsDelegate();

  @override
  bool isSupported(Locale locale) => true;

  @override
  Future<WidgetsLocalizations> load(Locale locale) =>
      GlobalWidgetsLocalizations.delegate.load(const Locale('en'));

  @override
  bool shouldReload(_FallbackWidgetsDelegate old) => false;
}
