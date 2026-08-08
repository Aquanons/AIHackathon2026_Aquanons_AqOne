import 'package:flutter/material.dart';

import '../../core/tokens.dart';
import '../../models/buoy_contact.dart';

class BuoyStatusCard extends StatelessWidget {
  const BuoyStatusCard({super.key, required this.status});

  final BuoyStatus? status;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    final current = status;

    if (current == null) {
      return _Shell(
        palette: palette,
        accent: AqColors.disabled,
        headline: 'No buoy connected',
        detail: 'Join a buoy WiFi network to hand off an SOS.',
      );
    }

    return _Shell(
      palette: palette,
      accent:
          current.mesh == MeshHealth.ok ? AqColors.success : AqColors.warning,
      headline: 'Buoy ${current.buoyId}',
      detail: current.mesh.description,
      battery: current.hasBattery ? current.battery : null,
      queued: current.queued,
    );
  }
}

class _Shell extends StatelessWidget {
  const _Shell({
    required this.palette,
    required this.accent,
    required this.headline,
    required this.detail,
    this.battery,
    this.queued = 0,
  });

  final AqPalette palette;
  final Color accent;
  final String headline;
  final String detail;
  final int? battery;
  final int queued;

  @override
  Widget build(BuildContext context) {
    final batteryLabel = battery;
    return Container(
      padding: const EdgeInsets.all(AqSpace.base),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AqRadius.card),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: accent,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: AqSpace.sm),
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
                Text(
                  '$batteryLabel%',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    fontFamily: 'monospace',
                    color: palette.secondaryText,
                  ),
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
            Text(
              '$queued message(s) waiting on this buoy',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AqColors.warning,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
