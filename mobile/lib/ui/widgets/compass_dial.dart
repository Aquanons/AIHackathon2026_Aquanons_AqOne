import 'dart:math' as math;

import 'package:flutter/material.dart';

/// A compass rose that rotates against a fixed index mark, the way a real
/// compass card does: the card turns, the ship's mark stays at the top.
///
/// [headingDegrees] is where the top of the phone is pointing, 0-360 clockwise
/// from magnetic north. Pass null when there is no sensor - the dial then
/// renders north-up and greyed, so the screen still reads as a compass instead
/// of showing a lie.
class CompassDial extends StatelessWidget {
  const CompassDial({
    super.key,
    required this.headingDegrees,
    required this.isDark,
    this.size = 58,
    this.needsCalibration = false,
  });

  final double? headingDegrees;
  final bool isDark;
  final double size;
  final bool needsCalibration;

  @override
  Widget build(BuildContext context) {
    final bool live = headingDegrees != null;
    final Color face = isDark ? const Color(0xFF0F172A) : Colors.white;
    final Color ink = isDark ? const Color(0xFF38BDF8) : const Color(0xFF0F69C9);
    final Color muted = isDark
        ? Colors.white.withValues(alpha: 0.45)
        : const Color(0xFF64748B);

    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _CompassPainter(
          // The card turns opposite the phone: face east and north swings
          // round to the left.
          rotation: -(headingDegrees ?? 0) * math.pi / 180.0,
          face: face,
          ink: live ? ink : muted,
          muted: muted,
          north: needsCalibration
              ? const Color(0xFFF59E0B)
              : const Color(0xFFEF4444),
          live: live,
        ),
      ),
    );
  }
}

class _CompassPainter extends CustomPainter {
  _CompassPainter({
    required this.rotation,
    required this.face,
    required this.ink,
    required this.muted,
    required this.north,
    required this.live,
  });

  final double rotation;
  final Color face;
  final Color ink;
  final Color muted;
  final Color north;
  final bool live;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset centre = Offset(size.width / 2, size.height / 2);
    final double r = size.width / 2;

    canvas.drawCircle(
      centre,
      r - 1,
      Paint()..color = face.withValues(alpha: 0.92),
    );
    canvas.drawCircle(
      centre,
      r - 1,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..color = ink.withValues(alpha: 0.8),
    );

    // Fixed index mark - "you are pointing this way". Drawn before the canvas
    // is rotated so it stays at the top of the screen.
    final Path index = Path()
      ..moveTo(centre.dx, 1.5)
      ..lineTo(centre.dx - 3.5, 7)
      ..lineTo(centre.dx + 3.5, 7)
      ..close();
    canvas.drawPath(index, Paint()..color = ink);

    canvas.save();
    canvas.translate(centre.dx, centre.dy);
    canvas.rotate(rotation);

    // Ticks every 15 degrees, longer on the cardinals.
    final Paint tick = Paint()..strokeCap = StrokeCap.round;
    for (int deg = 0; deg < 360; deg += 15) {
      final bool cardinal = deg % 90 == 0;
      final double a = deg * math.pi / 180.0;
      final double outer = r - 4;
      final double inner = outer - (cardinal ? 5.5 : 2.5);
      tick
        ..strokeWidth = cardinal ? 1.6 : 1.0
        ..color = cardinal ? ink : muted.withValues(alpha: 0.6);
      canvas.drawLine(
        Offset(math.sin(a) * inner, -math.cos(a) * inner),
        Offset(math.sin(a) * outer, -math.cos(a) * outer),
        tick,
      );
    }

    // Cardinal letters ride the card, so N always sits over true magnetic
    // north no matter which way the phone is held.
    const List<String> labels = <String>['N', 'E', 'S', 'W'];
    for (int i = 0; i < 4; i++) {
      final double a = i * math.pi / 2;
      final double d = r - 15;
      _label(
        canvas,
        labels[i],
        Offset(math.sin(a) * d, -math.cos(a) * d),
        i == 0 ? north : ink,
        i == 0 ? FontWeight.w900 : FontWeight.w700,
        i == 0 ? 11 : 9.5,
      );
    }

    // Needle: red half points north, tail is muted.
    final double needle = r - 21;
    final Path northHalf = Path()
      ..moveTo(0, -needle)
      ..lineTo(-4, 2)
      ..lineTo(4, 2)
      ..close();
    canvas.drawPath(northHalf, Paint()..color = north);
    final Path southHalf = Path()
      ..moveTo(0, needle * 0.72)
      ..lineTo(-3.2, 2)
      ..lineTo(3.2, 2)
      ..close();
    canvas.drawPath(southHalf, Paint()..color = muted.withValues(alpha: 0.75));

    canvas.drawCircle(Offset.zero, 2.2, Paint()..color = face);
    canvas.drawCircle(
      Offset.zero,
      2.2,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = ink,
    );

    canvas.restore();
  }

  void _label(
    Canvas canvas,
    String text,
    Offset at,
    Color color,
    FontWeight weight,
    double fontSize,
  ) {
    final TextPainter tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: color,
          fontSize: fontSize,
          fontWeight: weight,
          height: 1,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    // Counter-rotate so the letters stay upright on screen; a rose whose
    // letters are upside down at the bottom is unreadable at this size.
    canvas.save();
    canvas.translate(at.dx, at.dy);
    canvas.rotate(-rotation);
    tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
    canvas.restore();
  }

  @override
  bool shouldRepaint(_CompassPainter old) {
    return old.rotation != rotation ||
        old.ink != ink ||
        old.north != north ||
        old.face != face ||
        old.live != live;
  }
}
