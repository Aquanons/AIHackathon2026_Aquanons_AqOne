import 'package:flutter/material.dart';

import '../../models/sea_condition.dart';

/// The official sea condition, shown at the top of Home.
///
/// Four states are always distinguishable: safe, caution, not advised, and
/// not yet set. "Not yet set" is deliberately never rendered as green - an
/// absent decision is not the same as a decision that it is safe.
class SeaConditionBanner extends StatelessWidget {
  const SeaConditionBanner({
    super.key,
    required this.condition,
    this.isLoading = false,
  });

  final SeaCondition? condition;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    if (condition == null) {
      return _Shell(
        color: const Color(0xFF6B7280),
        isDark: isDark,
        child: Row(
          children: <Widget>[
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFF6B7280).withValues(alpha: 0.14),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: isLoading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(
                        Icons.cloud_off_rounded,
                        color: Color(0xFF6B7280),
                        size: 20,
                      ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                isLoading
                    ? 'Checking sea condition…'
                    : 'Sea condition unavailable. Check advisories before '
                        'heading out.',
                style: TextStyle(
                  fontSize: 13,
                  height: 1.35,
                  color: isDark ? Colors.white70 : const Color(0xFF475569),
                ),
              ),
            ),
          ],
        ),
      );
    }

    final value = condition!;
    final status = value.status;
    final stale = value.isStale();

    return _Shell(
      color: status.color,
      isDark: isDark,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: status.color.withValues(alpha: isDark ? 0.24 : 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(status.icon, color: status.color, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  status.headline,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: status.color,
                  ),
                ),
              ),
              if (stale) const _StaleChip(),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            value.subtitle,
            style: TextStyle(
              fontSize: 13,
              height: 1.35,
              color: isDark ? Colors.white70 : const Color(0xFF334155),
            ),
          ),
          if (value.setByName != null) ...<Widget>[
            const SizedBox(height: 6),
            Text(
              'Set by ${value.setByName}',
              style: TextStyle(
                fontSize: 11,
                color: isDark ? Colors.white54 : const Color(0xFF64748B),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Shell extends StatelessWidget {
  const _Shell({
    required this.color,
    required this.isDark,
    required this.child,
  });

  final Color color;
  final bool isDark;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: isDark ? 0.16 : 0.08),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withValues(alpha: 0.35)),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: color.withValues(alpha: isDark ? 0.20 : 0.12),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: child,
    );
  }
}

/// Marks a reading that has not refreshed recently.
///
/// Shown purely on the age of the data, so it appears for guests on the
/// public endpoint too.
class _StaleChip extends StatelessWidget {
  const _StaleChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xFF6B7280).withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
      ),
      child: const Text(
        'may be outdated',
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: Color(0xFF475569),
        ),
      ),
    );
  }
}
