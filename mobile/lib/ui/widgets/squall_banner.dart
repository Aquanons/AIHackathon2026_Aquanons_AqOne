import 'package:flutter/material.dart';

import '../../models/squall_watch.dart';

/// Squall nowcast card, shown directly above the sea-condition banner.
///
/// Renders nothing at all when there is no squall. An always-present "no squall
/// detected" card trains people to ignore this part of the screen, which is the
/// last thing you want from the one element that has to be noticed in a hurry.
///
/// The RETURN NOW state is deliberately loud, and it keeps showing after the
/// fisher acknowledges the alarm - acknowledging silences the sound, it does not
/// mean the weather has passed.
class SquallBanner extends StatelessWidget {
  const SquallBanner({
    super.key,
    required this.watch,
    this.acknowledged = false,
    this.onAcknowledge,
  });

  final SquallWatch watch;
  final bool acknowledged;
  final VoidCallback? onAcknowledge;

  @override
  Widget build(BuildContext context) {
    if (!watch.shouldDisplay) {
      return const SizedBox.shrink();
    }

    final bool isReturnNow = watch.level == SquallLevel.returnNow;
    final Color accent =
        isReturnNow ? const Color(0xFFDC2626) : const Color(0xFFF59E0B);
    final bool isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: isDark ? 0.18 : 0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: accent, width: isReturnNow ? 2 : 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(
                isReturnNow
                    ? Icons.warning_amber_rounded
                    : Icons.thunderstorm_rounded,
                color: accent,
                size: isReturnNow ? 26 : 22,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  isReturnNow ? 'RETURN NOW' : 'Squall watch',
                  style: TextStyle(
                    color: accent,
                    fontWeight: FontWeight.w900,
                    fontSize: isReturnNow ? 20 : 16,
                    letterSpacing: isReturnNow ? 0.5 : 0,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            _body(isReturnNow),
            style: TextStyle(
              fontSize: 13,
              height: 1.35,
              color: isDark ? Colors.white : const Color(0xFF1F2937),
              fontWeight: isReturnNow ? FontWeight.w600 : FontWeight.normal,
            ),
          ),
          if (watch.triggeredBuoys.isNotEmpty) ...<Widget>[
            const SizedBox(height: 4),
            Text(
              'Detected at ${watch.triggeredBuoys.join(', ')}',
              style: TextStyle(
                fontSize: 11,
                color: isDark ? Colors.white70 : const Color(0xFF475569),
              ),
            ),
          ],
          const SizedBox(height: 6),
          // The calibration state is shown, not hidden. While the model is
          // trained on simulated data the app says so, even here.
          Text(
            watch.calibration == 'synthetic'
                ? 'AqOne squall nowcast · calibrated on simulated data · '
                    'not a PAGASA warning'
                : 'AqOne squall nowcast · not a PAGASA warning',
            style: TextStyle(
              fontSize: 10.5,
              color: isDark ? Colors.white60 : const Color(0xFF64748B),
            ),
          ),
          if (isReturnNow && acknowledged) ...<Widget>[
            const SizedBox(height: 8),
            Row(
              children: <Widget>[
                Icon(Icons.check_circle, size: 15, color: accent),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'You acknowledged this warning. It stays until the squall '
                    'passes.',
                    style: TextStyle(fontSize: 11.5, color: accent),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  String _body(bool isReturnNow) {
    final int? lead = watch.leadMinutes;
    if (isReturnNow) {
      if (lead != null && lead > 0) {
        return 'A squall is forecast to reach your area in about $lead '
            '${lead == 1 ? 'minute' : 'minutes'}. Head back to shore now.';
      }
      return 'A squall is forecast to reach your area shortly. Head back to '
          'shore now.';
    }
    if (lead != null && lead > 0) {
      return 'Unsettled conditions building, possible arrival in about $lead '
          '${lead == 1 ? 'minute' : 'minutes'}. Stay alert.';
    }
    return 'Unsettled conditions building nearby. Stay alert.';
  }
}
