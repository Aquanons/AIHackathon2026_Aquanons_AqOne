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

  /// Heading on the vessel details screen for a returning user.
  ///
  /// In en, this message translates to:
  /// **'Welcome back'**
  String get onboardingWelcomeBack;

  /// Heading on the first-run vessel registration screen.
  ///
  /// In en, this message translates to:
  /// **'Register your boat'**
  String get onboardingRegisterBoat;

  /// Instructions under the returning-user heading.
  ///
  /// In en, this message translates to:
  /// **'Check your details are still correct. Update them here if anything has changed.'**
  String get onboardingReturningBody;

  /// Explanation under the vessel registration heading. Keep SOS and MDRRMO untranslated.
  ///
  /// In en, this message translates to:
  /// **'No password. These details travel with your SOS so the MDRRMO knows who to look for.'**
  String get onboardingIntroBody;

  /// Error shown when vessel details cannot be saved locally.
  ///
  /// In en, this message translates to:
  /// **'Could not save your details. Please try again.'**
  String get onboardingSaveError;

  /// Label for the skipper's full-name field.
  ///
  /// In en, this message translates to:
  /// **'Full name'**
  String get fieldFullName;

  /// Label for the boat name or registration field.
  ///
  /// In en, this message translates to:
  /// **'Boat name or registration'**
  String get fieldBoatNameOrRegistration;

  /// Label for the registration-type selector.
  ///
  /// In en, this message translates to:
  /// **'Registration type'**
  String get fieldRegistrationType;

  /// Label for a registration number field. {type} is BoatR, FishR, or CFVGL.
  ///
  /// In en, this message translates to:
  /// **'{type} number'**
  String fieldRegistrationNumber(String type);

  /// Label for the skipper's Philippine mobile-number field.
  ///
  /// In en, this message translates to:
  /// **'Mobile number'**
  String get fieldMobileNumber;

  /// Primary button that saves registration and continues into the app.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get actionContinue;

  /// Title and link for the help page.
  ///
  /// In en, this message translates to:
  /// **'Help & Support'**
  String get helpSupport;

  /// Title and link for the AqOne information page.
  ///
  /// In en, this message translates to:
  /// **'About AqOne'**
  String get aboutAqOne;

  /// Link to the safety and terms notice.
  ///
  /// In en, this message translates to:
  /// **'Safety notice'**
  String get safetyNotice;

  /// Text before Privacy Policy and Terms of Use links.
  ///
  /// In en, this message translates to:
  /// **'By continuing you agree to the'**
  String get agreementPrefix;

  /// Link and title for the privacy policy.
  ///
  /// In en, this message translates to:
  /// **'Privacy Policy'**
  String get privacyPolicy;

  /// Connector between Privacy Policy and Terms of Use links. Preserve surrounding spaces.
  ///
  /// In en, this message translates to:
  /// **' and '**
  String get agreementAnd;

  /// Link and title for terms of use.
  ///
  /// In en, this message translates to:
  /// **'Terms of Use'**
  String get termsOfUse;

  /// Checkbox label controlling whether identity remains stored on the phone.
  ///
  /// In en, this message translates to:
  /// **'Remember me on this device'**
  String get rememberDevice;

  /// Warning that registration details are self-declared and false SOS calls are offences. Keep AqOne, BFAR, LGU, MDRRMO, and SOS untranslated.
  ///
  /// In en, this message translates to:
  /// **'AqOne cannot check these details against BFAR or your LGU. They are recorded as your own declaration and shown to the MDRRMO with your SOS. Sending a false distress call is an offence.'**
  String get identityUnverifiedNotice;

  /// Explanation of the BoatR registration option.
  ///
  /// In en, this message translates to:
  /// **'Municipal boat registration (3 GT and below)'**
  String get licenseBoatRHint;

  /// Explanation of the FishR registration option.
  ///
  /// In en, this message translates to:
  /// **'Municipal fisherfolk registration number'**
  String get licenseFishRHint;

  /// Explanation of the CFVGL registration option.
  ///
  /// In en, this message translates to:
  /// **'Commercial vessel licence (3.1 GT and above)'**
  String get licenseCfvglHint;

  /// Registration selector option for a skipper with no available registration.
  ///
  /// In en, this message translates to:
  /// **'Not registered yet'**
  String get licenseNoneLabel;

  /// Explanation under the Not registered yet option.
  ///
  /// In en, this message translates to:
  /// **'You can add this later in settings'**
  String get licenseNoneHint;

  /// Identity trust label when details were entered only on this phone.
  ///
  /// In en, this message translates to:
  /// **'Self-declared'**
  String get trustSelfDeclared;

  /// Identity trust label when the phone number was verified.
  ///
  /// In en, this message translates to:
  /// **'Phone verified'**
  String get trustPhoneVerified;

  /// Identity trust label after a responder confirms the vessel.
  ///
  /// In en, this message translates to:
  /// **'Confirmed by responder'**
  String get trustResponderConfirmed;

  /// Validation error for an empty skipper name.
  ///
  /// In en, this message translates to:
  /// **'Please enter your full name'**
  String get validatorFullNameRequired;

  /// Validation error for a one-character skipper name.
  ///
  /// In en, this message translates to:
  /// **'That name looks too short'**
  String get validatorNameTooShort;

  /// Validation error when a field exceeds its maximum length.
  ///
  /// In en, this message translates to:
  /// **'Please keep this under {max} characters'**
  String validatorMaxCharacters(int max);

  /// Validation error when a skipper name contains no letters.
  ///
  /// In en, this message translates to:
  /// **'Please enter your name, not a number'**
  String get validatorNameNotNumber;

  /// Validation error for an empty boat name.
  ///
  /// In en, this message translates to:
  /// **'Please enter your boat name'**
  String get validatorBoatRequired;

  /// Validation error for an empty mobile number.
  ///
  /// In en, this message translates to:
  /// **'Please enter a mobile number'**
  String get validatorMobileRequired;

  /// Validation error for a malformed Philippine mobile number.
  ///
  /// In en, this message translates to:
  /// **'Enter a PH mobile number, e.g. 0912 345 6789'**
  String get validatorMobileInvalid;

  /// Validation error for an empty required registration number.
  ///
  /// In en, this message translates to:
  /// **'Enter your {type} number, or choose ‘{noneLabel}’'**
  String validatorLicenseRequired(String type, String noneLabel);

  /// Validation error for a short registration number.
  ///
  /// In en, this message translates to:
  /// **'That {type} number looks too short'**
  String validatorLicenseTooShort(String type);

  /// Validation error for a long registration number.
  ///
  /// In en, this message translates to:
  /// **'That {type} number looks too long'**
  String validatorLicenseTooLong(String type);

  /// Validation error for invalid registration-number characters.
  ///
  /// In en, this message translates to:
  /// **'Use letters, numbers and dashes only'**
  String get validatorLicenseCharacters;

  /// Validation error when a registration number has no digit.
  ///
  /// In en, this message translates to:
  /// **'A {type} number contains at least one digit'**
  String validatorLicenseDigit(String type);

  /// Validation error when a FishR number contains letters.
  ///
  /// In en, this message translates to:
  /// **'FishR numbers are digits only'**
  String get validatorFishrDigitsOnly;

  /// Title of the vessel profile screen.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profileTitle;

  /// Tooltip for editing the vessel profile.
  ///
  /// In en, this message translates to:
  /// **'Edit profile'**
  String get profileEdit;

  /// Confirmation shown after saving profile changes.
  ///
  /// In en, this message translates to:
  /// **'Profile updated'**
  String get profileUpdated;

  /// Fallback when the skipper has no saved name.
  ///
  /// In en, this message translates to:
  /// **'No name set'**
  String get profileNoName;

  /// Label for the saved boat name on the profile.
  ///
  /// In en, this message translates to:
  /// **'Boat name'**
  String get profileBoatName;

  /// Label for the automatically generated vessel identifier.
  ///
  /// In en, this message translates to:
  /// **'Vessel ID'**
  String get profileVesselId;

  /// Heading above application settings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTitle;

  /// Setting that enables the dark color theme.
  ///
  /// In en, this message translates to:
  /// **'Dark mode'**
  String get darkMode;

  /// Cancels the current edit or dialog.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get actionCancel;

  /// Saves edits to the vessel profile.
  ///
  /// In en, this message translates to:
  /// **'Save changes'**
  String get actionSaveChanges;

  /// Warning shown before saving edited identity details.
  ///
  /// In en, this message translates to:
  /// **'Editing your details resets your trust tier to self-declared. A responder will need to re-confirm your identity.'**
  String get profileEditTrustNotice;

  /// Signs the current identity out of this device.
  ///
  /// In en, this message translates to:
  /// **'Log out'**
  String get logoutAction;

  /// Confirmation shown before logging out. Keep AqOne and SOS untranslated.
  ///
  /// In en, this message translates to:
  /// **'You will need to register again to use AqOne. Your SOS history on this device will be kept.'**
  String get logoutConfirmation;

  /// Error shown when a profile photo cannot be saved.
  ///
  /// In en, this message translates to:
  /// **'Could not update your profile photo.'**
  String get avatarUpdateError;

  /// Profile photo option that opens the camera.
  ///
  /// In en, this message translates to:
  /// **'Take a photo'**
  String get avatarTakePhoto;

  /// Profile photo option that opens the image gallery.
  ///
  /// In en, this message translates to:
  /// **'Choose from gallery'**
  String get avatarChooseGallery;

  /// Profile photo option that deletes the current picture.
  ///
  /// In en, this message translates to:
  /// **'Remove photo'**
  String get avatarRemovePhoto;

  /// SAFETY CRITICAL. Responder status code 1 of 5 (docs/13_RESPONDER_LOOP.md), shown in the responder dialog once a dispatcher has acknowledged the SOS. Means only that the call was seen, not that help has left yet.
  ///
  /// In en, this message translates to:
  /// **'MDRRMO has your call'**
  String get responderStatusReceived;

  /// SAFETY CRITICAL. Responder status code 2 of 5. A rescue boat has actually left to respond.
  ///
  /// In en, this message translates to:
  /// **'Rescue boat on the way'**
  String get responderStatusDispatched;

  /// SAFETY CRITICAL. Responder status code 3 of 5. Keep 'Coast Guard' as the closest local equivalent term, not a literal dictionary translation.
  ///
  /// In en, this message translates to:
  /// **'Coast Guard notified'**
  String get responderStatusCoastGuard;

  /// SAFETY CRITICAL. Responder status code 4 of 5. Other fishing boats near the distress position have been asked to help.
  ///
  /// In en, this message translates to:
  /// **'Nearby boats alerted'**
  String get responderStatusNearestVessel;

  /// SAFETY CRITICAL. Responder status code 5 of 5. Must not read as help has been cancelled - it is still coming, just later than first said.
  ///
  /// In en, this message translates to:
  /// **'Delayed — still coming'**
  String get responderStatusDelayed;

  /// SAFETY CRITICAL. Button in the responder dialog. One tap tells MDRRMO the fisher received the ETA and the emergency is not over.
  ///
  /// In en, this message translates to:
  /// **'Still in danger'**
  String get responderReplyStillInDanger;

  /// SAFETY CRITICAL. Button in the responder dialog. Tapping this leads to a confirmation before it is sent, because it tells MDRRMO to stand the rescue down.
  ///
  /// In en, this message translates to:
  /// **'Safe now'**
  String get responderReplySafeNow;

  /// SAFETY CRITICAL. Confirmation text shown before sending 'Safe now', since it can redirect a rescue already underway.
  ///
  /// In en, this message translates to:
  /// **'This tells MDRRMO you no longer need rescue, and they may send help elsewhere instead. Only confirm if you are actually safe.'**
  String get responderReplyConfirmBody;

  /// SAFETY CRITICAL. Confirms the 'Safe now' reply after the warning text. Must read as a deliberate, informed choice, not a casual OK.
  ///
  /// In en, this message translates to:
  /// **'Yes, I\'m safe'**
  String get responderReplyConfirmConfirm;

  /// Shown after the fisher taps Still in danger and the reply has been recorded (sent or queued).
  ///
  /// In en, this message translates to:
  /// **'MDRRMO knows you are still waiting for help.'**
  String get responderReplySentStillInDanger;

  /// Shown after the fisher confirms Safe now and the reply has been recorded (sent or queued).
  ///
  /// In en, this message translates to:
  /// **'MDRRMO has been told you are safe.'**
  String get responderReplySentSafeNow;

  /// SAFETY CRITICAL. Shown when a reply could not reach the backend immediately and is saved locally to retry later. Must not imply the reply already reached MDRRMO.
  ///
  /// In en, this message translates to:
  /// **'Not sent yet — will send automatically once you have a connection.'**
  String get responderReplyPending;

  /// Caption under a nearby-boat chat message this handset sent while not connected to the Aquan hub WiFi. The line is saved on this phone only and has not been put on the wire yet - see docs/05_PUBLIC_API.md.
  ///
  /// In en, this message translates to:
  /// **'Queued'**
  String get chatStatusQueued;

  /// Caption under a nearby-boat chat message this handset wrote to the hub's WebSocket. The hub protocol has no delivery receipt, so this only means the phone put the line on the wire - not that the hub, another boat, or shore received it.
  ///
  /// In en, this message translates to:
  /// **'Sent'**
  String get chatStatusSent;

  /// Caption under a nearby-boat chat message once the cloud backend has confirmed it stored the line (HTTP 201 from POST /api/mesh/chat). Distinct from chatStatusSent, which has no such confirmation.
  ///
  /// In en, this message translates to:
  /// **'Synced'**
  String get chatStatusSynced;

  /// Live character counter under the chat compose box, shown before the fisher sends so the 50-character limit is visible ahead of time, not just after a rejection.
  ///
  /// In en, this message translates to:
  /// **'{used}/{max}'**
  String chatCharacterLimitLabel(int used, int max);

  /// SAFETY CRITICAL. Heading on the neutral squall banner shown whenever the backend cannot confirm a squall status - stale data, too few reporting buoys, or another quality problem, not staleness alone. Must read as neutral/informational, never alarming - it replaces the RETURN NOW/watch banner, which never appears in this state, and it must not be softened into implying the sea is calm.
  ///
  /// In en, this message translates to:
  /// **'Squall nowcast: status unavailable'**
  String get squallStaleTitle;

  /// SAFETY CRITICAL. Body text on the neutral squall notice when the backend supplied a last-reading time. {age} is a short duration like "3h" or "45 min", already formatted - do not add units around the placeholder.
  ///
  /// In en, this message translates to:
  /// **'Last known reading {age} ago. Not showing a squall status right now.'**
  String squallStaleBodyWithAge(String age);

  /// SAFETY CRITICAL. Body text on the neutral squall notice when no last-reading time is available at all.
  ///
  /// In en, this message translates to:
  /// **'Not showing a squall status right now.'**
  String get squallStaleBodyNoAge;
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
