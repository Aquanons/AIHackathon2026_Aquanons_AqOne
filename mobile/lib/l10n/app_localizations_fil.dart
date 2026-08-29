// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Filipino Pilipino (`fil`).
class AppLocalizationsFil extends AppLocalizations {
  AppLocalizationsFil([String locale = 'fil']) : super(locale);

  @override
  String get languageSettingTitle => 'Wika';

  @override
  String get languageSettingSubtitle =>
      'Piliin ang wikang gagamitin sa buong app';

  @override
  String get languagePickerPrompt => 'Piliin ang iyong wika';

  @override
  String get navHome => 'Home';

  @override
  String get navVenture => 'Paglalayag';

  @override
  String get navAdvisories => 'Mga Abiso';

  @override
  String get navProfile => 'Profile';

  @override
  String get deliveryStateSavedTitle => 'Naka-save';

  @override
  String get deliveryStateSavedDescription =>
      'Hindi pa naipapadala — walang malapit na buoy. Awtomatikong ipapadala.';

  @override
  String get deliveryStateRelayedTitle => 'Naipasa';

  @override
  String get deliveryStateRelayedDescription =>
      'Naibigay na sa buoy. Naghihintay sa radyo.';

  @override
  String get deliveryStateDeliveredTitle => 'Naihatid';

  @override
  String get deliveryStateDeliveredDescription =>
      'Natanggap na ng dashboard ng MDRRMO.';

  @override
  String get deliveryStateAcknowledgedTitle => 'Sinagot';

  @override
  String get deliveryStateAcknowledgedDescription =>
      'Nakita na ng responder ang SOS na ito.';

  @override
  String get deliveryMetaPosition => 'Posisyon';

  @override
  String get deliveryMetaBuoy => 'Buoy';

  @override
  String get deliveryMetaNote => 'Tala';

  @override
  String get deliveryMetaResponder => 'Responder';

  @override
  String get deliveryMetaLastAttempt => 'Huling subok';

  @override
  String get deliveryNoGpsFix => 'Walang naitalang GPS';

  @override
  String get seaStatusSafeHeadline => 'Ligtas Lumabas';

  @override
  String get seaStatusSafeSubtitle => 'Maganda ang kalagayan ng dagat.';

  @override
  String get seaStatusCautionHeadline => 'Mag-ingat - Tingnan ang Abiso';

  @override
  String get seaStatusCautionSubtitle => 'Mag-ingat bago lumabas.';

  @override
  String get seaStatusNotAdvisedHeadline => 'Huwag Lumabas';

  @override
  String get seaStatusNotAdvisedSubtitle =>
      'Manatili sa pampang - delikado ang kalagayan.';

  @override
  String get seaStatusUnknownHeadline => 'Wala Pang Abiso';

  @override
  String get seaStatusUnknownSubtitle => 'Tingnan ang mga abiso bago lumabas.';

  @override
  String get crashTitle => 'May naganap na problema';

  @override
  String get crashBody =>
      'Hindi ma-load ang bahaging ito ng screen. Subukang bumalik, o i-restart ang app kung paulit-ulit ito.';

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
  String get onboardingWelcomeBack => 'Maligayang pagbabalik';

  @override
  String get onboardingRegisterBoat => 'Irehistro ang iyong bangka';

  @override
  String get onboardingReturningBody =>
      'Tiyaking tama pa rin ang iyong mga detalye. I-update ang anumang nagbago.';

  @override
  String get onboardingIntroBody =>
      'Walang password. Kasama ang mga detalyeng ito sa iyong SOS upang malaman ng MDRRMO kung sino ang hahanapin.';

  @override
  String get onboardingSaveError =>
      'Hindi ma-save ang iyong mga detalye. Pakisubukan muli.';

  @override
  String get fieldFullName => 'Buong pangalan';

  @override
  String get fieldBoatNameOrRegistration => 'Pangalan o rehistro ng bangka';

  @override
  String get fieldRegistrationType => 'Uri ng rehistro';

  @override
  String fieldRegistrationNumber(String type) {
    return 'Numero ng $type';
  }

  @override
  String get fieldMobileNumber => 'Numero ng mobile';

  @override
  String get actionContinue => 'Magpatuloy';

  @override
  String get helpSupport => 'Tulong at Suporta';

  @override
  String get aboutAqOne => 'Tungkol sa AqOne';

  @override
  String get safetyNotice => 'Paunawa sa kaligtasan';

  @override
  String get agreementPrefix => 'Sa pagpapatuloy, sumasang-ayon ka sa';

  @override
  String get privacyPolicy => 'Patakaran sa Privacy';

  @override
  String get agreementAnd => ' at ';

  @override
  String get termsOfUse => 'Mga Tuntunin ng Paggamit';

  @override
  String get rememberDevice => 'Tandaan ako sa device na ito';

  @override
  String get identityUnverifiedNotice =>
      'Hindi masusuri ng AqOne ang mga detalyeng ito laban sa BFAR o sa iyong LGU. Itinatala ang mga ito bilang sarili mong deklarasyon at ipinapakita sa MDRRMO kasama ng iyong SOS. Ang pagpapadala ng maling distress call ay isang paglabag.';

  @override
  String get licenseBoatRHint =>
      'Rehistro ng munisipal na bangka (3 GT pababa)';

  @override
  String get licenseFishRHint =>
      'Numero ng rehistro ng munisipal na mangingisda';

  @override
  String get licenseCfvglHint =>
      'Lisensya ng komersyal na sasakyang-dagat (3.1 GT pataas)';

  @override
  String get licenseNoneLabel => 'Hindi pa rehistrado';

  @override
  String get licenseNoneHint =>
      'Maaari mo itong idagdag sa settings sa ibang pagkakataon';

  @override
  String get trustSelfDeclared => 'Sariling deklarasyon';

  @override
  String get trustPhoneVerified => 'Beripikado ang telepono';

  @override
  String get trustResponderConfirmed => 'Kinumpirma ng responder';

  @override
  String get validatorFullNameRequired => 'Ilagay ang iyong buong pangalan';

  @override
  String get validatorNameTooShort => 'Masyadong maikli ang pangalang iyon';

  @override
  String validatorMaxCharacters(int max) {
    return 'Panatilihin ito sa ilalim ng $max character';
  }

  @override
  String get validatorNameNotNumber =>
      'Ilagay ang iyong pangalan, hindi numero';

  @override
  String get validatorBoatRequired => 'Ilagay ang pangalan ng iyong bangka';

  @override
  String get validatorMobileRequired => 'Ilagay ang numero ng mobile';

  @override
  String get validatorMobileInvalid =>
      'Maglagay ng PH mobile number, hal. 0912 345 6789';

  @override
  String validatorLicenseRequired(String type, String noneLabel) {
    return 'Ilagay ang numero ng $type, o piliin ang ‘$noneLabel’';
  }

  @override
  String validatorLicenseTooShort(String type) {
    return 'Masyadong maikli ang numero ng $type';
  }

  @override
  String validatorLicenseTooLong(String type) {
    return 'Masyadong mahaba ang numero ng $type';
  }

  @override
  String get validatorLicenseCharacters =>
      'Gumamit lamang ng letra, numero, at gitling';

  @override
  String validatorLicenseDigit(String type) {
    return 'Dapat may kahit isang digit ang numero ng $type';
  }

  @override
  String get validatorFishrDigitsOnly => 'Mga digit lamang ang numero ng FishR';

  @override
  String get profileTitle => 'Profile';

  @override
  String get profileEdit => 'I-edit ang profile';

  @override
  String get profileUpdated => 'Na-update ang profile';

  @override
  String get profileNoName => 'Walang nakalagay na pangalan';

  @override
  String get profileBoatName => 'Pangalan ng bangka';

  @override
  String get profileVesselId => 'ID ng sasakyang-dagat';

  @override
  String get settingsTitle => 'Mga Setting';

  @override
  String get darkMode => 'Dark mode';

  @override
  String get actionCancel => 'Kanselahin';

  @override
  String get actionSaveChanges => 'I-save ang mga pagbabago';

  @override
  String get profileEditTrustNotice =>
      'Kapag in-edit ang iyong mga detalye, babalik sa sariling deklarasyon ang antas ng tiwala. Kailangang kumpirmahing muli ng responder ang iyong pagkakakilanlan.';

  @override
  String get logoutAction => 'Mag-log out';

  @override
  String get logoutConfirmation =>
      'Kailangan mong magrehistro muli upang magamit ang AqOne. Mananatili sa device na ito ang iyong kasaysayan ng SOS.';

  @override
  String get avatarUpdateError =>
      'Hindi ma-update ang iyong larawan sa profile.';

  @override
  String get avatarTakePhoto => 'Kumuha ng larawan';

  @override
  String get avatarChooseGallery => 'Pumili mula sa gallery';

  @override
  String get avatarRemovePhoto => 'Alisin ang larawan';

  @override
  String get responderStatusReceived => 'Natanggap ng MDRRMO ang iyong tawag';

  @override
  String get responderStatusDispatched => 'Papunta na ang bangkang panagip';

  @override
  String get responderStatusCoastGuard => 'Naabisuhan na ang Coast Guard';

  @override
  String get responderStatusNearestVessel =>
      'Naalertuhan na ang mga malapit na bangka';

  @override
  String get responderStatusDelayed => 'Naantala — papunta pa rin';

  @override
  String get responderReplyStillInDanger => 'Nasa panganib pa rin';

  @override
  String get responderReplySafeNow => 'Ligtas na';

  @override
  String get responderReplyConfirmBody =>
      'Sasabihin nito sa MDRRMO na hindi mo na kailangan ng sagip, at maaari nilang ipadala ang tulong sa iba. Kumpirmahin lamang kung talagang ligtas ka na.';

  @override
  String get responderReplyConfirmConfirm => 'Oo, ligtas ako';

  @override
  String get responderReplySentStillInDanger =>
      'Alam ng MDRRMO na naghihintay ka pa rin ng tulong.';

  @override
  String get responderReplySentSafeNow =>
      'Nasabihan na ang MDRRMO na ligtas ka na.';

  @override
  String get responderReplyPending =>
      'Hindi pa naipapadala — awtomatikong ipapadala kapag may koneksyon na.';

  @override
  String get chatStatusQueued => 'Nakapila';

  @override
  String get chatStatusSent => 'Naipadala';

  @override
  String get chatStatusSynced => 'Na-sync';

  @override
  String chatCharacterLimitLabel(int used, int max) {
    return '$used/$max';
  }

  @override
  String get squallStaleTitle => 'Pagtataya ng unos: lumang datos';

  @override
  String squallStaleBodyWithAge(String age) {
    return 'Huling babasahin: $age na ang nakalipas. Wala munang ipapakitang katayuan hangga\'t walang sariwang datos.';
  }

  @override
  String get squallStaleBodyNoAge =>
      'Wala munang ipapakitang katayuan ng unos hangga\'t walang sariwang datos.';
}
