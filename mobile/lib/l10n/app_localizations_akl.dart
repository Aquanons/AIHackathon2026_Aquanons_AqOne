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
}
