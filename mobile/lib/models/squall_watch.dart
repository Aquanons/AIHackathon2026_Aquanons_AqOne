/// Squall nowcast from the backend's AI (`GET /api/public/squall`).
///
/// The alarm condition is decided server-side, by the model's own threshold.
/// This client never re-derives it from raw probabilities: a cutoff invented on
/// the handset could disagree with the dashboard about whether a squall is
/// happening, and the two must never tell different stories about the same
/// weather.
library;

enum SquallLevel {
  /// No detections. Nothing to show.
  clear,

  /// Detections below the model's threshold. Visible, but must not alarm.
  watch,

  /// At or above the threshold. This is the RETURN NOW condition.
  returnNow,

  /// The model could not be evaluated - missing model file, no readings, or
  /// no connection. Deliberately distinct from `clear`: an alarm that cannot
  /// be evaluated must never be rendered as "all clear".
  unknown,
}

class SquallWatch {
  const SquallWatch({
    required this.level,
    required this.returnNow,
    this.leadMinutes,
    this.triggeredBuoys = const <String>[],
    this.asOf,
    this.calibration,
  });

  final SquallLevel level;
  final bool returnNow;

  /// Soonest forecast arrival across affected buoys, in minutes.
  final int? leadMinutes;

  final List<String> triggeredBuoys;
  final DateTime? asOf;

  /// "synthetic" while the models are calibrated on simulated data. Surfaced
  /// in the UI rather than hidden, so the app never implies more certainty
  /// than the model has earned.
  final String? calibration;

  /// The state to show when the backend cannot be reached at all.
  static const SquallWatch unavailable = SquallWatch(
    level: SquallLevel.unknown,
    returnNow: false,
  );

  bool get shouldDisplay =>
      level == SquallLevel.watch || level == SquallLevel.returnNow;

  static SquallLevel _levelFrom(String? raw) {
    switch (raw) {
      case 'return_now':
        return SquallLevel.returnNow;
      case 'watch':
        return SquallLevel.watch;
      case 'clear':
        return SquallLevel.clear;
      default:
        return SquallLevel.unknown;
    }
  }

  static SquallWatch? tryParse(Object? decoded) {
    if (decoded is! Map<String, dynamic>) {
      return null;
    }

    final level = _levelFrom(decoded['level'] as String?);

    // Trust the server's boolean, but never render returnNow without the
    // level agreeing. If the two disagree the payload is malformed, and the
    // safe reading of a malformed alarm is "unknown", not "fire it".
    final serverReturnNow = decoded['return_now'] == true;
    final returnNow = serverReturnNow && level == SquallLevel.returnNow;

    final lead = decoded['lead_minutes'];
    final buoys = decoded['triggered_buoys'];
    final asOfRaw = decoded['as_of'];

    return SquallWatch(
      level: level,
      returnNow: returnNow,
      leadMinutes: lead is num ? lead.round() : null,
      triggeredBuoys: buoys is List
          ? buoys.whereType<String>().toList(growable: false)
          : const <String>[],
      asOf: asOfRaw is String ? DateTime.tryParse(asOfRaw) : null,
      calibration: decoded['calibration'] as String?,
    );
  }

  /// Identity for deciding whether this is the *same* squall the fisher has
  /// already acknowledged, or a new one that should alarm again.
  ///
  /// Keyed on the affected buoys rather than the timestamp: `as_of` advances
  /// every time the buoys report, so keying on it would re-fire the alarm
  /// every poll for one continuous squall.
  String get identity => triggeredBuoys.isEmpty
      ? 'squall'
      : (List<String>.from(triggeredBuoys)..sort()).join(',');
}
