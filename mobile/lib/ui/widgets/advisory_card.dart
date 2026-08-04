import 'package:flutter/material.dart';

import '../../models/advisory.dart';

/// One advisory, used both for the Home preview and in the full list.
class AdvisoryCard extends StatelessWidget {
  const AdvisoryCard({
    super.key,
    required this.advisory,
    this.remaining = 0,
    this.onViewAll,
    this.maxDescriptionLines = 3,
  });

  final Advisory advisory;

  /// How many further advisories exist, for the preview footer.
  final int remaining;

  final VoidCallback? onViewAll;
  final int maxDescriptionLines;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final priority = advisory.priority;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
        ),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.05),
            blurRadius: 20,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: priority.color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  priority.label.toUpperCase(),
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                    color: priority.color,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  advisory.municipality,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark ? Colors.white54 : const Color(0xFF64748B),
                  ),
                ),
              ),
              if (advisory.publishDate != null)
                Text(
                  _shortDate(advisory.publishDate!),
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark ? Colors.white54 : const Color(0xFF64748B),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            advisory.title,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              height: 1.3,
              color: isDark ? Colors.white : const Color(0xFF0F172A),
            ),
          ),
          if (advisory.description.isNotEmpty) ...<Widget>[
            const SizedBox(height: 6),
            Text(
              advisory.description,
              maxLines: maxDescriptionLines,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 13,
                height: 1.4,
                color: isDark ? Colors.white70 : const Color(0xFF475569),
              ),
            ),
          ],
          if (advisory.expirationDate != null) ...<Widget>[
            const SizedBox(height: 8),
            Text(
              'In force until ${_shortDate(advisory.expirationDate!)}',
              style: TextStyle(
                fontSize: 11,
                fontStyle: FontStyle.italic,
                color: isDark ? Colors.white54 : const Color(0xFF64748B),
              ),
            ),
          ],
          if (onViewAll != null) ...<Widget>[
            const SizedBox(height: 12),
            InkWell(
              onTap: onViewAll,
              child: Row(
                children: <Widget>[
                  Text(
                    remaining > 0
                        ? 'View all ($remaining more)'
                        : 'View all advisories',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: priority.color,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Icon(
                    Icons.arrow_forward_rounded,
                    size: 15,
                    color: priority.color,
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  static String _shortDate(DateTime value) {
    const months = <String>[
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${value.day} ${months[value.month - 1]}';
  }
}
