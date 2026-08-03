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

    final bool connected = current != null;
    final Color accent = !connected
        ? AqColors.disabled
        : current.mesh == MeshHealth.ok
            ? AqColors.success
            : AqColors.warning;

    final String headline =
        connected ? 'Buoy ${current.buoyId}' : 'No buoy connected';
    final String detail = connected
        ? current.mesh.description
        : 'Join a buoy WiFi network to hand off an SOS.';

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
                decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
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
              if (connected && current.hasBattery)
                Text(
                  '${current.battery}%',
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
          if (connected && current.queued > 0) ...<Widget>[
            const SizedBox(height: AqSpace.sm),
            Text(
              '${current.queued} message(s) waiting on this buoy',
              style: TextStyle(
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
