import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_akl.dart';
import 'app_localizations_en.dart';
import 'app_localizations_fil.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('akl'),
    Locale('en'),
    Locale('fil')
  ];

  /// Section heading on the Profile page for the language selector.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get languageSettingTitle;

  /// Helper text under the Language setting on the Profile page.
  ///
  /// In en, this message translates to:
  /// **'Choose the language for the whole app'**
  String get languageSettingSubtitle;

  /// Heading on the first onboarding screen, shown before the user has picked a language. Must be short enough to be guessable by a speaker of any of the three languages.
  ///
  /// In en, this message translates to:
  /// **'Choose your language'**
  String get languagePickerPrompt;

  /// Bottom navigation label for the main SOS screen. Keep short - the bottom bar has four items and overflows easily.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// Bottom navigation label for the trip screen with weather, compass and map.
  ///
  /// In en, this message translates to:
  /// **'Venture mode'**
  String get navVenture;

  /// Bottom navigation label for official MDRRMO notices.
  ///
  /// In en, this message translates to:
  /// **'Advisories'**
  String get navAdvisories;

  /// Bottom navigation label for the user's vessel details and settings.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get navProfile;

  /// SAFETY CRITICAL. First of four delivery states. The SOS is on the phone only and has reached nobody. Must not sound reassuring - the user has to understand help is not yet coming.
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get deliveryStateSavedTitle;

  /// SAFETY CRITICAL. Explains the Saved state. Two facts: it has not been sent, and the phone will keep trying without the user doing anything.
  ///
  /// In en, this message translates to:
  /// **'Not sent — no buoy nearby. Will send automatically.'**
  String get deliveryStateSavedDescription;

  /// SAFETY CRITICAL. Second of four delivery states. A buoy accepted the SOS and is passing it over the LoRa radio mesh. Nobody has received it yet.
  ///
  /// In en, this message translates to:
  /// **'Relayed'**
  String get deliveryStateRelayedTitle;

  /// SAFETY CRITICAL. Explains the Relayed state. 'Mesh' means the chain of radio buoys - use whatever a fisherman would actually call it, not a literal translation.
  ///
  /// In en, this message translates to:
  /// **'Handed to the buoy. Waiting for the mesh.'**
  String get deliveryStateRelayedDescription;

  /// SAFETY CRITICAL. Third of four delivery states. The MDRRMO dashboard received the SOS, but no human has confirmed seeing it.
  ///
  /// In en, this message translates to:
  /// **'Delivered'**
  String get deliveryStateDeliveredTitle;

  /// SAFETY CRITICAL. Explains the Delivered state. Keep 'MDRRMO' untranslated - it is the official agency acronym.
  ///
  /// In en, this message translates to:
  /// **'Received by the MDRRMO dashboard.'**
  String get deliveryStateDeliveredDescription;

  /// SAFETY CRITICAL. Fourth and final delivery state. A human responder has seen the SOS and is acting on it. This is the only state that means help is coming.
  ///
  /// In en, this message translates to:
  /// **'Acknowledged'**
  String get deliveryStateAcknowledgedTitle;

  /// SAFETY CRITICAL. Explains the Acknowledged state.
  ///
  /// In en, this message translates to:
  /// **'Responder acknowledged this SOS.'**
  String get deliveryStateAcknowledgedDescription;

  /// Row label next to the GPS coordinates of an SOS.
  ///
  /// In en, this message translates to:
  /// **'Position'**
  String get deliveryMetaPosition;

  /// Row label next to the id of the buoy that carried the SOS.
  ///
  /// In en, this message translates to:
  /// **'Buoy'**
  String get deliveryMetaBuoy;

  /// Row label next to the free-text message the user typed with their SOS.
  ///
  /// In en, this message translates to:
  /// **'Note'**
  String get deliveryMetaNote;

  /// Row label next to the name of the MDRRMO responder who acknowledged the SOS.
  ///
  /// In en, this message translates to:
  /// **'Responder'**
  String get deliveryMetaResponder;

  /// Row label next to the reason the most recent send attempt failed.
  ///
  /// In en, this message translates to:
  /// **'Last attempt'**
  String get deliveryMetaLastAttempt;

  /// Shown in place of coordinates when the phone had no GPS lock at the moment the SOS was sent. The SOS is still valid without it.
  ///
  /// In en, this message translates to:
  /// **'No GPS fix recorded'**
  String get deliveryNoGpsFix;

  /// SAFETY CRITICAL. Official MDRRMO go/no-go call, green. This is a human decision and outranks the app's own weather guess.
  ///
  /// In en, this message translates to:
  /// **'Safe to Go Out'**
  String get seaStatusSafeHeadline;

  /// SAFETY CRITICAL. Default explanation under the Safe headline, used when the MDRRMO gave no reason of their own.
  ///
  /// In en, this message translates to:
  /// **'Sea conditions are favorable.'**
  String get seaStatusSafeSubtitle;

  /// SAFETY CRITICAL. Official MDRRMO call, amber. Not a ban, but the user must read the advisories before deciding.
  ///
  /// In en, this message translates to:
  /// **'Caution - Check Advisories'**
  String get seaStatusCautionHeadline;

  /// SAFETY CRITICAL. Default explanation under the Caution headline.
  ///
  /// In en, this message translates to:
  /// **'Exercise caution before heading out.'**
  String get seaStatusCautionSubtitle;

  /// SAFETY CRITICAL. Official MDRRMO call, red. The strongest warning in the app. Needs a second native-speaker reviewer - understating this in translation is a real hazard.
  ///
  /// In en, this message translates to:
  /// **'Not Advised to Go Out'**
  String get seaStatusNotAdvisedHeadline;

  /// SAFETY CRITICAL. Default explanation under the Not Advised headline. Imperative mood - this is an instruction, not a suggestion.
  ///
  /// In en, this message translates to:
  /// **'Stay ashore - conditions are dangerous.'**
  String get seaStatusNotAdvisedSubtitle;

  /// Shown when the MDRRMO has not published a call, or the phone could not fetch one. Must not read as 'safe'.
  ///
  /// In en, this message translates to:
  /// **'Status Not Yet Set'**
  String get seaStatusUnknownHeadline;

  /// Default explanation under the Status Not Yet Set headline.
  ///
  /// In en, this message translates to:
  /// **'Check advisories before heading out.'**
  String get seaStatusUnknownSubtitle;

  /// Heading on the fallback screen shown when part of the UI fails to build.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get crashTitle;

  /// Body of the crash fallback screen. Deliberately plain - it replaces a Flutter stack trace that a fisherman at sea has no use for.
  ///
  /// In en, this message translates to:
  /// **'This part of the screen couldn\'t load. Try going back, or restart the app if it keeps happening.'**
  String get crashBody;

  /// Heading above the seven day chips on the Home weather card.
  ///
  /// In en, this message translates to:
  /// **'7-day outlook'**
  String get forecastStripTitle;

  /// Shown when the outlook came from the offline cache rather than a live fetch. {time} is a clock time like "6:12 AM". Placeholder must be kept.
  ///
  /// In en, this message translates to:
  /// **'as of {time}'**
  String forecastAsOf(String time);

  /// Label on the first chip of the outlook strip, in place of a weekday name.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get forecastToday;

  /// SAFETY CRITICAL. Footnote under the outlook strip when no wave data was available. Must keep both halves: that sea state is missing, and that this is not an official call.
  ///
  /// In en, this message translates to:
  /// **'Forecast guidance from wind and rain only — sea state not available. Not an official PAGASA or MDRRMO call.'**
  String get forecastDisclaimerNoSeaState;

  /// SAFETY CRITICAL. Footnote under the outlook strip. Must not be softened into sounding like an official advisory.
  ///
  /// In en, this message translates to:
  /// **'Forecast guidance, not an official PAGASA or MDRRMO call. Always check the sea condition above.'**
  String get forecastDisclaimer;

  /// SAFETY CRITICAL. Green day in the outlook strip. Means the forecast shows nothing adverse - NOT that it is safe to go out, which only the MDRRMO sea condition can say.
  ///
  /// In en, this message translates to:
  /// **'Safe'**
  String get riskLevelSafe;

  /// SAFETY CRITICAL. Amber day in the outlook strip.
  ///
  /// In en, this message translates to:
  /// **'Caution'**
  String get riskLevelCaution;

  /// SAFETY CRITICAL. Red day in the outlook strip. Needs a second reviewer - understating this is a real hazard.
  ///
  /// In en, this message translates to:
  /// **'Dangerous'**
  String get riskLevelDanger;

  /// Grey day in the outlook strip: not enough forecast data to judge. Must not read as "fine" or "calm".
  ///
  /// In en, this message translates to:
  /// **'No data'**
  String get riskLevelUnknown;

  /// Single letter for north on the Venture compass dial. Keep to one or two characters - it is drawn inside a 58px dial.
  ///
  /// In en, this message translates to:
  /// **'N'**
  String get compassNorth;

  /// Single letter for east on the Venture compass dial. Keep to one or two characters.
  ///
  /// In en, this message translates to:
  /// **'E'**
  String get compassEast;

  /// Single letter for south on the Venture compass dial. Keep to one or two characters.
  ///
  /// In en, this message translates to:
  /// **'S'**
  String get compassSouth;

  /// Single letter for west on the Venture compass dial. Keep to one or two characters.
  ///
  /// In en, this message translates to:
  /// **'W'**
  String get compassWest;

  /// Tooltip when the handset has no magnetometer, so the dial is greyed out.
  ///
  /// In en, this message translates to:
  /// **'Compass unavailable on this device'**
  String get compassUnavailable;

  /// Tooltip when magnetic field strength is out of range, usually an uncalibrated sensor or a magnet nearby. The figure-8 motion is the standard fix and should stay in the translation.
  ///
  /// In en, this message translates to:
  /// **'Compass needs calibrating — move the phone in a figure 8'**
  String get compassNeedsCalibration;

  /// Tooltip showing the current compass heading. {degrees} is a whole number 0-359. Placeholder must be kept.
  ///
  /// In en, this message translates to:
  /// **'Heading {degrees}°'**
  String compassHeading(int degrees);

  /// Title of the map legend for the modelled hotspot layer. Avoid wording that promises fish.
  ///
  /// In en, this message translates to:
  /// **'Likely fishing areas'**
  String get hotspotLegendTitle;

  /// SAFETY CRITICAL. Sits under the hotspot legend. Both denials must survive translation: no guaranteed catch, and this is not a safety call.
  ///
  /// In en, this message translates to:
  /// **'Estimate from catch logs. Not a promise of fish, and not a safe-to-go-out signal.'**
  String get hotspotLegendDisclaimer;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['akl', 'en', 'fil'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'akl':
      return AppLocalizationsAkl();
    case 'en':
      return AppLocalizationsEn();
    case 'fil':
      return AppLocalizationsFil();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
