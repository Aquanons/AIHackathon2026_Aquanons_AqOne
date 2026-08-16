import 'dart:async';
import 'dart:math' as math;

import 'package:sensors_plus/sensors_plus.dart';

/// One smoothed compass sample.
class CompassReading {
  const CompassReading({
    required this.headingDegrees,
    required this.fieldStrength,
    required this.needsCalibration,
  });

  /// Magnetic heading of the top of the phone, 0-360 clockwise from north.
  ///
  /// This is MAGNETIC north, not true north. Correcting to true north needs a
  /// declination model (WMM); around the Philippines the offset is under one
  /// degree, which is far below the accuracy of a phone magnetometer on a
  /// moving boat, so it is not worth carrying the model.
  final double headingDegrees;

  /// Magnitude of the measured magnetic field, in microtesla.
  final double fieldStrength;

  /// True when the field strength is nowhere near Earth's (25-65 uT), which
  /// means the sensor is uncalibrated or something magnetic is nearby - a
  /// speaker, a phone mount, or the boat's engine. The reading is unreliable.
  final bool needsCalibration;

  /// Eight-point cardinal label for the heading, e.g. "NE".
  String get cardinal {
    const List<String> points = <String>[
      'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW',
    ];
    return points[(((headingDegrees + 22.5) % 360) ~/ 45)];
  }
}

/// Turns the raw magnetometer and accelerometer streams into a heading.
///
/// Written against sensors_plus rather than flutter_compass: flutter_compass
/// is unmaintained and ships no Android namespace, so it fails to build under
/// AGP 8. The maths here is the same tilt compensation Android's
/// SensorManager.getRotationMatrix does.
class CompassService {
  CompassService({Duration? samplingPeriod})
      : _samplingPeriod = samplingPeriod ?? SensorInterval.uiInterval;

  final Duration _samplingPeriod;

  StreamController<CompassReading>? _controller;
  StreamSubscription<MagnetometerEvent>? _magSub;
  StreamSubscription<AccelerometerEvent>? _accSub;

  // Latest raw samples. Gravity is seeded as "lying flat, screen up" so the
  // first magnetometer sample already produces a usable heading instead of
  // being dropped.
  double _mx = 0, _my = 0, _mz = 0;
  double _ax = 0, _ay = 0, _az = 9.81;
  bool _hasMag = false;

  // The smoothed heading is carried as a unit vector, not as an angle. Taking
  // a running average of degrees breaks at the 359 -> 0 wrap and makes the
  // needle spin the long way round through south.
  double _sin = 0, _cos = 1;
  bool _seeded = false;

  double _lastEmitted = double.nan;
  DateTime _lastEmitAt = DateTime.fromMillisecondsSinceEpoch(0);

  /// How hard to smooth. Lower is steadier but laggier; 0.2 settles in about
  /// a third of a second at the UI sampling rate, which reads as "live"
  /// without the needle jittering while the boat rocks.
  static const double _smoothing = 0.2;

  /// Emits nothing at all on a device with no magnetometer (most emulators,
  /// all web builds). Callers should treat "no event yet" as unsupported
  /// after a short grace period rather than waiting forever.
  Stream<CompassReading> get readings {
    _controller ??= StreamController<CompassReading>.broadcast(
      onListen: _start,
      onCancel: _stop,
    );
    return _controller!.stream;
  }

  void _start() {
    _magSub = magnetometerEventStream(samplingPeriod: _samplingPeriod).listen(
      (MagnetometerEvent e) {
        _mx = e.x;
        _my = e.y;
        _mz = e.z;
        _hasMag = true;
        _compute();
      },
      onError: (_) {},
      cancelOnError: false,
    );
    _accSub = accelerometerEventStream(samplingPeriod: _samplingPeriod).listen(
      (AccelerometerEvent e) {
        _ax = e.x;
        _ay = e.y;
        _az = e.z;
      },
      onError: (_) {},
      cancelOnError: false,
    );
  }

  void _stop() {
    _magSub?.cancel();
    _accSub?.cancel();
    _magSub = null;
    _accSub = null;
    _hasMag = false;
    _seeded = false;
  }

  void _compute() {
    if (!_hasMag) {
      return;
    }
    final controller = _controller;
    if (controller == null || controller.isClosed) {
      return;
    }

    // east = magnetic x gravity, north = gravity x east. Both are only
    // meaningful once normalised.
    double ex = _my * _az - _mz * _ay;
    double ey = _mz * _ax - _mx * _az;
    double ez = _mx * _ay - _my * _ax;
    final double eLen = math.sqrt(ex * ex + ey * ey + ez * ez);

    final double aLen = math.sqrt(_ax * _ax + _ay * _ay + _az * _az);

    // Degenerate when the phone is aimed straight down the field lines, or
    // in free fall. Keep the previous heading rather than emit a wild one.
    if (eLen < 0.1 || aLen < 0.1) {
      return;
    }

    ex /= eLen;
    ey /= eLen;
    ez /= eLen;

    final double ax = _ax / aLen;
    final double ay = _ay / aLen;
    final double az = _az / aLen;

    final double ny = az * ex - ax * ez;

    // Same as SensorManager.getOrientation: azimuth = atan2(east.y, north.y).
    final double radians = math.atan2(ey, ny);

    final double s = math.sin(radians);
    final double c = math.cos(radians);
    if (_seeded) {
      _sin += (s - _sin) * _smoothing;
      _cos += (c - _cos) * _smoothing;
    } else {
      _sin = s;
      _cos = c;
      _seeded = true;
    }

    final double degrees =
        (math.atan2(_sin, _cos) * 180.0 / math.pi + 360.0) % 360.0;

    final double strength =
        math.sqrt(_mx * _mx + _my * _my + _mz * _mz);
    final bool needsCalibration = strength < 20.0 || strength > 70.0;

    // The sensor fires far faster than anyone can read a dial. Throttling to
    // ~20fps and half a degree keeps the map screen from rebuilding constantly.
    final DateTime now = DateTime.now();
    final bool movedEnough = _lastEmitted.isNaN ||
        _angleDelta(degrees, _lastEmitted) >= 0.5;
    if (!movedEnough || now.difference(_lastEmitAt).inMilliseconds < 50) {
      return;
    }
    _lastEmitted = degrees;
    _lastEmitAt = now;

    controller.add(
      CompassReading(
        headingDegrees: degrees,
        fieldStrength: strength,
        needsCalibration: needsCalibration,
      ),
    );
  }

  static double _angleDelta(double a, double b) {
    final double d = (a - b).abs() % 360.0;
    return d > 180.0 ? 360.0 - d : d;
  }

  Future<void> dispose() async {
    _stop();
    await _controller?.close();
    _controller = null;
  }
}
