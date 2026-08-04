import 'package:flutter/material.dart';

import '../../core/tokens.dart';
import '../../models/buoy_contact.dart';

class BuoyStatusCard extends StatelessWidget {
  const BuoyStatusCard({super.key, required this.status, this.onTap});

  final BuoyStatus? status;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    final current = status;

    return _Shell(
      palette: palette,
      onTap: onTap,
      accent: current == null
          ? AqColors.disabled
          : (current.mesh == MeshHealth.ok
              ? AqColors.success
              : AqColors.warning),
      icon: current == null ? Icons.wifi_off_rounded : Icons.anchor_rounded,
      headline:
          current == null ? 'No buoy connected' : 'Buoy ${current.buoyId}',
      detail: current == null
          ? 'Join a buoy WiFi network to hand off an SOS.'
          : current.mesh.description,
      battery: current?.hasBattery ?? false ? current?.battery : null,
      queued: current?.queued ?? 0,
    );
  }
}

class _Shell extends StatelessWidget {
  const _Shell({
    required this.palette,
    required this.accent,
    required this.icon,
    required this.headline,
    required this.detail,
    this.onTap,
    this.battery,
    this.queued = 0,
  });

  final AqPalette palette;
  final Color accent;
  final IconData icon;
  final String headline;
  final String detail;
  final VoidCallback? onTap;
  final int? battery;
  final int queued;

  @override
  Widget build(BuildContext context) {
    final batteryLabel = battery;
    return Material(
      color: palette.surface,
      borderRadius: BorderRadius.circular(AqRadius.card),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AqRadius.card),
        child: Container(
          padding: const EdgeInsets.all(AqSpace.base),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AqRadius.card),
            border: Border.all(color: palette.border),
            boxShadow: <BoxShadow>[
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
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
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.14),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(icon, size: 22, color: accent),
                  ),
                  const SizedBox(width: AqSpace.md),
                  Expanded(
                    child: Text(
                      headline,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: palette.primaryText,
                      ),
                    ),
                  ),
                  if (batteryLabel != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: AqColors.success.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        children: <Widget>[
                          const Icon(
                            Icons.battery_5_bar_rounded,
                            size: 14,
                            color: AqColors.success,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '$batteryLabel%',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              fontFamily: 'monospace',
                              color: AqColors.success,
                            ),
                          ),
                        ],
                      ),
                    )
                  else if (onTap != null)
                    Icon(
                      Icons.chevron_right_rounded,
                      size: 22,
                      color: palette.dimText,
                    ),
                ],
              ),
              const SizedBox(height: AqSpace.sm),
              Text(
                detail,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.5,
                  color: palette.secondaryText,
                ),
              ),
              if (queued > 0) ...<Widget>[
                const SizedBox(height: AqSpace.sm),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: AqColors.warning.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: <Widget>[
                      const Icon(
                        Icons.hourglass_top_rounded,
                        size: 14,
                        color: AqColors.warning,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        '$queued message(s) waiting on this buoy',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AqColors.warning,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
