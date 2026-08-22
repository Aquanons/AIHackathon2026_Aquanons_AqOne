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
}
