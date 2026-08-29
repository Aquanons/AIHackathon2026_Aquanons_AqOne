// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Aklanon (`akl`).
class AppLocalizationsAkl extends AppLocalizations {
  AppLocalizationsAkl([String locale = 'akl']) : super(locale);

  @override
  String get languageSettingTitle => 'Lengguwahe';

  @override
  String get languageSettingSubtitle =>
      'Pilia ro lengguwahe para sa bug-os nga app';

  @override
  String get languagePickerPrompt => 'Pilia ro imong lengguwahe';

  @override
  String get navHome => 'Home';

  @override
  String get navVenture => 'Paglayag';

  @override
  String get navAdvisories => 'Mga Abiso';

  @override
  String get navProfile => 'Profile';

  @override
  String get deliveryStateSavedTitle => 'Nasave';

  @override
  String get deliveryStateSavedDescription =>
      'Owa pa napadaea — waeay malapit nga buoy. Automatiko nga ipapadaea.';

  @override
  String get deliveryStateRelayedTitle => 'Napasa';

  @override
  String get deliveryStateRelayedDescription =>
      'Nahatag ron sa buoy. Nagahueat sa radyo.';

  @override
  String get deliveryStateDeliveredTitle => 'Nadangat';

  @override
  String get deliveryStateDeliveredDescription =>
      'Nabaton ron it dashboard it MDRRMO.';

  @override
  String get deliveryStateAcknowledgedTitle => 'Nasabat';

  @override
  String get deliveryStateAcknowledgedDescription =>
      'Nakita ron it responder ining SOS.';

  @override
  String get deliveryMetaPosition => 'Posisyon';

  @override
  String get deliveryMetaBuoy => 'Buoy';

  @override
  String get deliveryMetaNote => 'Nota';

  @override
  String get deliveryMetaResponder => 'Responder';

  @override
  String get deliveryMetaLastAttempt => 'Huling pagtinguha';

  @override
  String get deliveryNoGpsFix => 'Waeay narekord nga GPS';

  @override
  String get seaStatusSafeHeadline => 'Ligtas nga Magguwa';

  @override
  String get seaStatusSafeSubtitle => 'Maayad ro kahimtangan it dagat.';

  @override
  String get seaStatusCautionHeadline => 'Mag-andam - Basaha ro Abiso';

  @override
  String get seaStatusCautionSubtitle => 'Mag-andam anay bag-o magguwa.';

  @override
  String get seaStatusNotAdvisedHeadline => 'Indi Magguwa';

  @override
  String get seaStatusNotAdvisedSubtitle =>
      'Magpabilin sa baybay - delikado ro kahimtangan.';

  @override
  String get seaStatusUnknownHeadline => 'Waeay pa nga Abiso';

  @override
  String get seaStatusUnknownSubtitle => 'Basaha ro mga abiso bag-o magguwa.';

  @override
  String get crashTitle => 'May problema nga natabo';

  @override
  String get crashBody =>
      'Indi mabuksan ining parte it screen. Subuki nga magbalik, o i-restart ro app kon padayon ini.';

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
  String get onboardingWelcomeBack => 'Maayad nga pagbalik';

  @override
  String get onboardingRegisterBoat => 'Irehistro ro imong baroto';

  @override
  String get onboardingReturningBody =>
      'Siguruhon nga husto gihapon ro imong mga detalye. Ilisi ro may nagbag-o.';

  @override
  String get onboardingIntroBody =>
      'Waeay password. Kaupod ro mga detalye sa imong SOS agud mahibaluan it MDRRMO kon sin-o ro pangitaon.';

  @override
  String get onboardingSaveError =>
      'Indi ma-save ro imong mga detalye. Palihog magsueod liwat.';

  @override
  String get fieldFullName => 'Bug-os nga ngaran';

  @override
  String get fieldBoatNameOrRegistration => 'Ngaran ukon rehistro it baroto';

  @override
  String get fieldRegistrationType => 'Klase it rehistro';

  @override
  String fieldRegistrationNumber(String type) {
    return 'Numero it $type';
  }

  @override
  String get fieldMobileNumber => 'Numero it mobile';

  @override
  String get actionContinue => 'Magpadayon';

  @override
  String get helpSupport => 'Bulig ag Suporta';

  @override
  String get aboutAqOne => 'Parte sa AqOne';

  @override
  String get safetyNotice => 'Pahibalo sa kaluwasan';

  @override
  String get agreementPrefix => 'Sa pagpadayon, nagauyon ka sa';

  @override
  String get privacyPolicy => 'Patakaran sa Privacy';

  @override
  String get agreementAnd => ' ag ';

  @override
  String get termsOfUse => 'Mga Kondisyon it Paggamit';

  @override
  String get rememberDevice => 'Dumdumon ako sa device nga ini';

  @override
  String get identityUnverifiedNotice =>
      'Indi masusi it AqOne ro mga detalye kontra sa BFAR ukon sa imong LGU. Ginarekord sanda bilang imong kaugalingong deklarasyon ag ginapakita sa MDRRMO kaupod it imong SOS. Ro pagpadala it bueaan nga distress call hay isa ka paglapas.';

  @override
  String get licenseBoatRHint =>
      'Rehistro it municipal nga baroto (3 GT paubos)';

  @override
  String get licenseFishRHint =>
      'Numero it rehistro it municipal nga mananagat';

  @override
  String get licenseCfvglHint =>
      'Lisensya it commercial nga sakayan (3.1 GT paibabaw)';

  @override
  String get licenseNoneLabel => 'Indi pa rehistrado';

  @override
  String get licenseNoneHint => 'Mahimo mo ini idugang sa settings sa ulihi';

  @override
  String get trustSelfDeclared => 'Kaugalingong deklarasyon';

  @override
  String get trustPhoneVerified => 'Nasusi ro telepono';

  @override
  String get trustResponderConfirmed => 'Ginkumpirma it responder';

  @override
  String get validatorFullNameRequired => 'Isueod ro imong bug-os nga ngaran';

  @override
  String get validatorNameTooShort => 'Masadong maikli ro ngaran';

  @override
  String validatorMaxCharacters(int max) {
    return 'Pabilina ini sa idaeom it $max ka karakter';
  }

  @override
  String get validatorNameNotNumber => 'Isueod ro imong ngaran, indi numero';

  @override
  String get validatorBoatRequired => 'Isueod ro ngaran it imong baroto';

  @override
  String get validatorMobileRequired => 'Isueod ro numero it mobile';

  @override
  String get validatorMobileInvalid =>
      'Isueod ro PH mobile number, hal. 0912 345 6789';

  @override
  String validatorLicenseRequired(String type, String noneLabel) {
    return 'Isueod ro numero it $type, ukon pilia ro ‘$noneLabel’';
  }

  @override
  String validatorLicenseTooShort(String type) {
    return 'Masadong maikli ro numero it $type';
  }

  @override
  String validatorLicenseTooLong(String type) {
    return 'Masadong maeaba ro numero it $type';
  }

  @override
  String get validatorLicenseCharacters =>
      'Gamiton eamang ro letra, numero, ag dash';

  @override
  String validatorLicenseDigit(String type) {
    return 'Kinahanglan may bisan sangka digit ro numero it $type';
  }

  @override
  String get validatorFishrDigitsOnly => 'Mga digit eamang ro numero it FishR';

  @override
  String get profileTitle => 'Profile';

  @override
  String get profileEdit => 'Ilisi ro profile';

  @override
  String get profileUpdated => 'Na-update ro profile';

  @override
  String get profileNoName => 'Waeay nakabutang nga ngaran';

  @override
  String get profileBoatName => 'Ngaran it baroto';

  @override
  String get profileVesselId => 'ID it baroto';

  @override
  String get settingsTitle => 'Mga Setting';

  @override
  String get darkMode => 'Madueom nga mode';

  @override
  String get actionCancel => 'Kanselahon';

  @override
  String get actionSaveChanges => 'I-save ro mga pagbag-o';

  @override
  String get profileEditTrustNotice =>
      'Kon ilisan ro imong mga detalye, mabalik sa kaugalingong deklarasyon ro antas it pagsalig. Kinahanglan nga kumpirmahon liwat it responder ro imong pagkakakilanlan.';

  @override
  String get logoutAction => 'Magguwa';

  @override
  String get logoutConfirmation =>
      'Kinahanglan mo magrehistro liwat agud magamit ro AqOne. Magapabilin sa device nga ini ro history it imong SOS.';

  @override
  String get avatarUpdateError => 'Indi ma-update ro imong litrato sa profile.';

  @override
  String get avatarTakePhoto => 'Magkuha it litrato';

  @override
  String get avatarChooseGallery => 'Magpili halin sa gallery';

  @override
  String get avatarRemovePhoto => 'Kuhaa ro litrato';

  @override
  String get responderStatusReceived => 'Nabaton it MDRRMO ro imong tawag';

  @override
  String get responderStatusDispatched =>
      'Nagapakadto ron ro sakayan nga panagip';

  @override
  String get responderStatusCoastGuard => 'Napahibaeuan ron ro Coast Guard';

  @override
  String get responderStatusNearestVessel =>
      'Napahibaeuan ron ro mga hueapit nga sakayan';

  @override
  String get responderStatusDelayed => 'Naulang — nagapakadto pa gihapon';

  @override
  String get responderReplyStillInDanger => 'Peligro pa gihapon';

  @override
  String get responderReplySafeNow => 'Seguro ron';

  @override
  String get responderReplyConfirmBody =>
      'Ini magasugid sa MDRRMO nga waea mo na kinahanglana ro pagsagip, kag mahimo nila ipadaea ro bueig sa iban. Kumpirmahon lamang kon seguro ka gid ron.';

  @override
  String get responderReplyConfirmConfirm => 'Huo, seguro ako';

  @override
  String get responderReplySentStillInDanger =>
      'Naeaman it MDRRMO nga nagahueat ka pa gihapon it bueig.';

  @override
  String get responderReplySentSafeNow =>
      'Napahibaeuan ron ro MDRRMO nga seguro ka ron.';

  @override
  String get responderReplyPending =>
      'Owa pa napadaea — automatiko nga ipapadaea kon may koneksyon ron.';

  @override
  String get chatStatusQueued => 'Nakapila';

  @override
  String get chatStatusSent => 'Napadaea';

  @override
  String get chatStatusSynced => 'Na-sync';

  @override
  String chatCharacterLimitLabel(int used, int max) {
    return '$used/$max';
  }

  @override
  String get squallStaleTitle =>
      'Pagtantiya sa unos: daan nga datos, indi masaligan';

  @override
  String squallStaleBodyWithAge(String age) {
    return 'Huling reading: $age na ang nakalabay. Waeay ipakita nga kahimtangan it unos hasta waeay bag-o nga datos.';
  }

  @override
  String get squallStaleBodyNoAge =>
      'Waeay ipakita nga kahimtangan it unos hasta waeay bag-o nga datos.';
}
