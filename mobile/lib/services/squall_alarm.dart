import 'dart:async';

import 'package:flutter/services.dart';

/// Persistent RETURN NOW alarm.
///
/// Uses only Flutter's built-in `HapticFeedback` and `SystemSound` - no extra
/// packages, so there is nothing new to break in the build.
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
  SquallAlarm({this.pulse = const Duration(seconds: 2)});

  /// Gap between buzz + tone repeats. Two seconds is insistent without being
  /// so frantic that the natural response is to force-quit the app - which
  /// would also kill SOS delivery.
  final Duration pulse;

  Timer? _timer;

  /// Identity of the squall currently being alarmed for, so one continuous
  /// squall does not re-trigger on every poll.
  String? _activeIdentity;

  /// Identity the fisher has acknowledged. A *new* squall alarms again even if
  /// the previous one was acknowledged.
  String? _acknowledgedIdentity;

  bool get isRinging => _timer != null;

  bool isAcknowledged(String identity) => _acknowledgedIdentity == identity;

  /// Start alarming for [identity], unless it is already ringing for it or the
  /// fisher has already acknowledged this same squall.
  void start(String identity) {
    if (_acknowledgedIdentity == identity) return;
    if (_timer != null && _activeIdentity == identity) return;

    _activeIdentity = identity;
    _timer?.cancel();

    _fire();
    _timer = Timer.periodic(pulse, (_) => _fire());
  }

  /// The fisher pressed "I'm heading back". Sound and vibration stop; the
  /// banner stays until the backend reports the squall has passed.
  void acknowledge() {
    if (_activeIdentity != null) {
      _acknowledgedIdentity = _activeIdentity;
    }
    _stopSound();
  }

  /// The squall cleared server-side. Reset fully so a later squall alarms
  /// again from scratch.
  void clear() {
    _activeIdentity = null;
    _acknowledgedIdentity = null;
    _stopSound();
  }

  void _stopSound() {
    _timer?.cancel();
    _timer = null;
  }

  void _fire() {
    // Fire and forget. A failed haptic on an unusual device must never take
    // down the warning, so both calls are allowed to fail silently.
    HapticFeedback.heavyImpact().catchError((_) {});
    SystemSound.play(SystemSoundType.alert).catchError((_) {});
  }

  void dispose() => _stopSound();
}
