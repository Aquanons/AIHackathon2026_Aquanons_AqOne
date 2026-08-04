import 'package:flutter/material.dart';

import '../../core/tokens.dart';
import '../../models/delivery_state.dart';
import '../../models/sos_record.dart';

class DeliveryStateTile extends StatelessWidget {
  const DeliveryStateTile({super.key, required this.record});

  final SosRecord record;

  Color _accent() {
    switch (record.state) {
      case DeliveryState.saved:
        return AqColors.warning;
      case DeliveryState.relayed:
        return AqColors.connectivity;
      case DeliveryState.delivered:
        return AqColors.info;
      case DeliveryState.acknowledged:
        return AqColors.success;
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    final accent = _accent();
    final position = record.hasFix
        ? '${record.lat!.toStringAsFixed(5)}, ${record.lon!.toStringAsFixed(5)}'
        : 'No GPS fix recorded';
    final stateIcon = switch (record.state) {
      DeliveryState.saved => Icons.save_rounded,
      DeliveryState.relayed => Icons.settings_input_antenna_rounded,
      DeliveryState.delivered => Icons.cloud_done_rounded,
      DeliveryState.acknowledged => Icons.verified_rounded,
    };

    return Container(
      margin: const EdgeInsets.only(bottom: AqSpace.md),
      padding: const EdgeInsets.all(AqSpace.base),
      decoration: BoxDecoration(
        color: palette.surface,
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
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.14),
                  shape: BoxShape.circle,
                ),
                child: Icon(stateIcon, size: 20, color: accent),
              ),
              const SizedBox(width: AqSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      record.state.title,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: palette.primaryText,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      record.state.description,
                      style: TextStyle(
                        fontSize: 12.5,
                        height: 1.35,
                        color: palette.secondaryText,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AqSpace.sm),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  _formatTime(record.createdAt),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: accent,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AqSpace.md),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AqSpace.md,
              vertical: AqSpace.sm,
            ),
            decoration: BoxDecoration(
              color: palette.surfaceAlt.withValues(alpha: 0.55),
              borderRadius: BorderRadius.circular(AqRadius.standard),
            ),
            child: Column(
              children: <Widget>[
                _MetaLine(label: 'Position', value: position, monospace: true),
                if (record.seq != null)
                  _MetaLine(
                    label: 'Buoy',
                    value: 'buoy ${record.buoyId} · seq ${record.seq}',
                    monospace: true,
                  ),
                if (record.note != null)
                  _MetaLine(label: 'Note', value: record.note!),
                if (record.ackedBy != null)
                  _MetaLine(label: 'Responder', value: record.ackedBy!),
                if (record.state == DeliveryState.saved &&
                    record.lastError != null)
                  _MetaLine(
                    label: 'Last attempt',
                    value: record.lastError!,
                    tone: AqColors.warning,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _formatTime(DateTime value) {
    final h = value.hour.toString().padLeft(2, '0');
    final m = value.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

class _MetaLine extends StatelessWidget {
  const _MetaLine({
    required this.label,
    required this.value,
    this.monospace = false,
    this.tone,
  });

  final String label;
  final String value;
  final bool monospace;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AqSpace.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 84,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: palette.dimText,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                fontFamily: monospace ? 'monospace' : null,
                color: tone ?? palette.secondaryText,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
