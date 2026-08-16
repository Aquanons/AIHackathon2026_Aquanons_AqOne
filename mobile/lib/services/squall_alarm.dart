import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:vibration/vibration.dart';

/// Persistent RETURN NOW alarm.
///
/// Plays the same looping tone and vibration pattern as [SosAlarm]. It used
/// to use HapticFeedback and SystemSound to avoid a dependency, but both
/// packages ship anyway for SOS, and the result was absurd: the alarm telling
/// a fisherman a squall was twenty minutes out was quieter than the one
/// confirming he had pressed a button. SystemSound is also silenced by iOS
/// silent mode, which is where a phone lives on a boat.
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
  SquallAlarm();

  final AudioPlayer _player = AudioPlayer();
  bool _ringing = false;

  /// Identity of the squall currently being alarmed for, so one continuous
  /// squall does not re-trigger on every poll.
  String? _activeIdentity;

  /// Identity the fisher has acknowledged. A *new* squall alarms again even if
  /// the previous one was acknowledged.
  String? _acknowledgedIdentity;

  bool get isRinging => _ringing;

  bool isAcknowledged(String identity) => _acknowledgedIdentity == identity;

  /// Start alarming for [identity], unless it is already ringing for it or the
  /// fisher has already acknowledged this same squall.
  void start(String identity) {
    if (_acknowledgedIdentity == identity) return;
    if (_ringing && _activeIdentity == identity) return;

    _activeIdentity = identity;
    _ringing = true;

    // Independent best-effort calls: a phone with no vibration motor must
    // still get the sound, and a phone with no audio output must still buzz.
    unawaited(_startVibration());
    unawaited(_startSound());
  }

  Future<void> _startVibration() async {
    try {
      final bool? hasVibrator = await Vibration.hasVibrator();
      if (hasVibrator != true || !_ringing) {
        return;
      }
      // Same pattern as SOS. Two sharp pulses then a pause, repeating - a
      // single continuous buzz fades into the background of a pocket.
      await Vibration.vibrate(
        pattern: const <int>[0, 400, 200, 400, 600],
        repeat: 0,
      );
    } catch (_) {}
  }

  Future<void> _startSound() async {
    try {
      await _player.setReleaseMode(ReleaseMode.loop);
      await _player.play(AssetSource('audio/sos_alarm.wav'));
    } catch (_) {}
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
    _ringing = false;
    unawaited(Vibration.cancel().catchError((_) {}));
    unawaited(_player.stop().catchError((_) {}));
  }

  void dispose() {
    _stopSound();
    unawaited(_player.dispose().catchError((_) {}));
  }
}
