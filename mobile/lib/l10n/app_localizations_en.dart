// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get languageSettingTitle => 'Language';

  @override
  String get languageSettingSubtitle => 'Choose the language for the whole app';

  @override
  String get languagePickerPrompt => 'Choose your language';

  @override
  String get navHome => 'Home';

  @override
  String get navVenture => 'Venture mode';

  @override
  String get navAdvisories => 'Advisories';

  @override
  String get navProfile => 'Profile';

  @override
  String get deliveryStateSavedTitle => 'Saved';

  @override
  String get deliveryStateSavedDescription =>
      'Not sent — no buoy nearby. Will send automatically.';

  @override
  String get deliveryStateRelayedTitle => 'Relayed';

  @override
  String get deliveryStateRelayedDescription =>
      'Handed to the buoy. Waiting for the mesh.';

  @override
  String get deliveryStateDeliveredTitle => 'Delivered';

  @override
  String get deliveryStateDeliveredDescription =>
      'Received by the MDRRMO dashboard.';

  @override
  String get deliveryStateAcknowledgedTitle => 'Acknowledged';

  @override
  String get deliveryStateAcknowledgedDescription =>
      'Responder acknowledged this SOS.';

  @override
  String get deliveryMetaPosition => 'Position';

  @override
  String get deliveryMetaBuoy => 'Buoy';

  @override
  String get deliveryMetaNote => 'Note';

  @override
  String get deliveryMetaResponder => 'Responder';

  @override
  String get deliveryMetaLastAttempt => 'Last attempt';

  @override
  String get deliveryNoGpsFix => 'No GPS fix recorded';

  @override
  String get seaStatusSafeHeadline => 'Safe to Go Out';

  @override
  String get seaStatusSafeSubtitle => 'Sea conditions are favorable.';

  @override
  String get seaStatusCautionHeadline => 'Caution - Check Advisories';

  @override
  String get seaStatusCautionSubtitle => 'Exercise caution before heading out.';

  @override
  String get seaStatusNotAdvisedHeadline => 'Not Advised to Go Out';

  @override
  String get seaStatusNotAdvisedSubtitle =>
      'Stay ashore - conditions are dangerous.';

  @override
  String get seaStatusUnknownHeadline => 'Status Not Yet Set';

  @override
  String get seaStatusUnknownSubtitle => 'Check advisories before heading out.';

  @override
  String get crashTitle => 'Something went wrong';

  @override
  String get crashBody =>
      'This part of the screen couldn\'t load. Try going back, or restart the app if it keeps happening.';

  @override
  String get forecastStripTitle => '7-day outlook';

  @override
  String forecastAsOf(String time) {
    return 'as of $time';
  }

  @override
  String get forecastToday => 'Today';

  @override
  String get forecastDisclaimerNoSeaState =>
      'Forecast guidance from wind and rain only — sea state not available. Not an official PAGASA or MDRRMO call.';

  @override
  String get forecastDisclaimer =>
      'Forecast guidance, not an official PAGASA or MDRRMO call. Always check the sea condition above.';

  @override
  String get riskLevelSafe => 'Safe';

  @override
  String get riskLevelCaution => 'Caution';

  @override
  String get riskLevelDanger => 'Dangerous';

  @override
  String get riskLevelUnknown => 'No data';

  @override
  String get compassNorth => 'N';

  @override
  String get compassEast => 'E';

  @override
  String get compassSouth => 'S';

  @override
  String get compassWest => 'W';

  @override
  String get compassUnavailable => 'Compass unavailable on this device';

  @override
  String get compassNeedsCalibration =>
      'Compass needs calibrating — move the phone in a figure 8';

  @override
  String compassHeading(int degrees) {
    return 'Heading $degrees°';
  }

  @override
  String get hotspotLegendTitle => 'Likely fishing areas';

  @override
  String get hotspotLegendDisclaimer =>
      'Estimate from catch logs. Not a promise of fish, and not a safe-to-go-out signal.';

  @override
  String get onboardingWelcomeBack => 'Welcome back';

  @override
  String get onboardingRegisterBoat => 'Register your boat';

  @override
  String get onboardingReturningBody =>
      'Check your details are still correct. Update them here if anything has changed.';

  @override
  String get onboardingIntroBody =>
      'No password. These details travel with your SOS so the MDRRMO knows who to look for.';

  @override
  String get onboardingSaveError =>
      'Could not save your details. Please try again.';

  @override
  String get fieldFullName => 'Full name';

  @override
  String get fieldBoatNameOrRegistration => 'Boat name or registration';

  @override
  String get fieldRegistrationType => 'Registration type';

  @override
  String fieldRegistrationNumber(String type) {
    return '$type number';
  }

  @override
  String get fieldMobileNumber => 'Mobile number';

  @override
  String get actionContinue => 'Continue';

  @override
  String get helpSupport => 'Help & Support';

  @override
  String get aboutAqOne => 'About AqOne';

  @override
  String get safetyNotice => 'Safety notice';

  @override
  String get agreementPrefix => 'By continuing you agree to the';

  @override
  String get privacyPolicy => 'Privacy Policy';

  @override
  String get agreementAnd => ' and ';

  @override
  String get termsOfUse => 'Terms of Use';

  @override
  String get rememberDevice => 'Remember me on this device';

  @override
  String get identityUnverifiedNotice =>
      'AqOne cannot check these details against BFAR or your LGU. They are recorded as your own declaration and shown to the MDRRMO with your SOS. Sending a false distress call is an offence.';

  @override
  String get licenseBoatRHint => 'Municipal boat registration (3 GT and below)';

  @override
  String get licenseFishRHint => 'Municipal fisherfolk registration number';

  @override
  String get licenseCfvglHint => 'Commercial vessel licence (3.1 GT and above)';

  @override
  String get licenseNoneLabel => 'Not registered yet';

  @override
  String get licenseNoneHint => 'You can add this later in settings';

  @override
  String get trustSelfDeclared => 'Self-declared';

  @override
  String get trustPhoneVerified => 'Phone verified';

  @override
  String get trustResponderConfirmed => 'Confirmed by responder';

  @override
  String get validatorFullNameRequired => 'Please enter your full name';

  @override
  String get validatorNameTooShort => 'That name looks too short';

  @override
  String validatorMaxCharacters(int max) {
    return 'Please keep this under $max characters';
  }

  @override
  String get validatorNameNotNumber => 'Please enter your name, not a number';

  @override
  String get validatorBoatRequired => 'Please enter your boat name';

  @override
  String get validatorMobileRequired => 'Please enter a mobile number';

  @override
  String get validatorMobileInvalid =>
      'Enter a PH mobile number, e.g. 0912 345 6789';

  @override
  String validatorLicenseRequired(String type, String noneLabel) {
    return 'Enter your $type number, or choose ‘$noneLabel’';
  }

  @override
  String validatorLicenseTooShort(String type) {
    return 'That $type number looks too short';
  }

  @override
  String validatorLicenseTooLong(String type) {
    return 'That $type number looks too long';
  }

  @override
  String get validatorLicenseCharacters =>
      'Use letters, numbers and dashes only';

  @override
  String validatorLicenseDigit(String type) {
    return 'A $type number contains at least one digit';
  }

  @override
  String get validatorFishrDigitsOnly => 'FishR numbers are digits only';

  @override
  String get profileTitle => 'Profile';

  @override
  String get profileEdit => 'Edit profile';

  @override
  String get profileUpdated => 'Profile updated';

  @override
  String get profileNoName => 'No name set';

  @override
  String get profileBoatName => 'Boat name';

  @override
  String get profileVesselId => 'Vessel ID';

  @override
  String get settingsTitle => 'Settings';

  @override
  String get darkMode => 'Dark mode';

  @override
  String get actionCancel => 'Cancel';

  @override
  String get actionSaveChanges => 'Save changes';

  @override
  String get profileEditTrustNotice =>
      'Editing your details resets your trust tier to self-declared. A responder will need to re-confirm your identity.';

  @override
  String get logoutAction => 'Log out';

  @override
  String get logoutConfirmation =>
      'You will need to register again to use AqOne. Your SOS history on this device will be kept.';

  @override
  String get avatarUpdateError => 'Could not update your profile photo.';

  @override
  String get avatarTakePhoto => 'Take a photo';

  @override
  String get avatarChooseGallery => 'Choose from gallery';

  @override
  String get avatarRemovePhoto => 'Remove photo';

  @override
  String get responderStatusReceived => 'MDRRMO has your call';

  @override
  String get responderStatusDispatched => 'Rescue boat on the way';

  @override
  String get responderStatusCoastGuard => 'Coast Guard notified';

  @override
  String get responderStatusNearestVessel => 'Nearby boats alerted';

  @override
  String get responderStatusDelayed => 'Delayed — still coming';

  @override
  String get responderReplyStillInDanger => 'Still in danger';

  @override
  String get responderReplySafeNow => 'Safe now';

  @override
  String get responderReplyConfirmBody =>
      'This tells MDRRMO you no longer need rescue, and they may send help elsewhere instead. Only confirm if you are actually safe.';

  @override
  String get responderReplyConfirmConfirm => 'Yes, I\'m safe';

  @override
  String get responderReplySentStillInDanger =>
      'MDRRMO knows you are still waiting for help.';

  @override
  String get responderReplySentSafeNow => 'MDRRMO has been told you are safe.';

  @override
  String get responderReplyPending =>
      'Not sent yet — will send automatically once you have a connection.';

  @override
  String get chatStatusQueued => 'Queued';

  @override
  String get chatStatusSent => 'Sent';

  @override
  String get chatStatusSynced => 'Synced';

  @override
  String chatCharacterLimitLabel(int used, int max) {
    return '$used/$max';
  }

  @override
  String get squallStaleTitle => 'Squall nowcast: status unavailable';

  @override
  String squallStaleBodyWithAge(String age) {
    return 'Last known reading $age ago. Not showing a squall status right now.';
  }

  @override
  String get squallStaleBodyNoAge => 'Not showing a squall status right now.';
}
