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
}
