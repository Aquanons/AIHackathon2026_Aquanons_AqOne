import 'sos_alarm.dart';

/// Persistent RETURN NOW alarm.
///
/// Plays the same looping tone and vibration pattern as [SosAlarm]. Delegates
/// audio and vibration to [SosAlarm] while retaining squall identity and
/// acknowledgement state.
///
/// ## What this can and cannot do
///
/// This alarm only fires **while the app is in the foreground**. It is not an
/// OS push notification: it will not wake a locked phone or fire from the
/// background. Doing that needs `flutter_local_notifications` and an Android
/// notification channel, which is a deliberate follow-up rather than a thing
/// we quietly pretend works.
///
/// Say that plainly if asked. A fisher with the app closed will not be woken
/// by this.
class SquallAlarm {
  SquallAlarm({SosAlarm? alarm}) : _alarm = alarm ?? SosAlarm();

  final SosAlarm _alarm;

  /// Identity of the squall currently being alarmed for, so one continuous
  /// squall does not re-trigger on every poll.
  String? _activeIdentity;

  /// Identity the fisher has acknowledged. A *new* squall alarms again even if
  /// the previous one was acknowledged.
  String? _acknowledgedIdentity;

  bool get isRinging => _alarm.isRinging;

  bool isAcknowledged(String identity) => _acknowledgedIdentity == identity;

  /// Start alarming for [identity], unless it is already ringing for it or the
  /// fisher has already acknowledged this same squall.
  void start(String identity) {
    if (_acknowledgedIdentity == identity) return;
    if (_alarm.isRinging && _activeIdentity == identity) return;

    _activeIdentity = identity;
    _alarm.start();
  }

  /// The fisher pressed "I'm heading back". Sound and vibration stop; the
  /// banner stays until the backend reports the squall has passed.
  void acknowledge() {
    if (_activeIdentity != null) {
      _acknowledgedIdentity = _activeIdentity;
    }
    _alarm.stop();
  }

  /// The squall cleared server-side. Reset fully so a later squall alarms
  /// again from scratch.
  void clear() {
    _activeIdentity = null;
    _acknowledgedIdentity = null;
    _alarm.stop();
  }

  void dispose() {
    _alarm.dispose();
  }
}
