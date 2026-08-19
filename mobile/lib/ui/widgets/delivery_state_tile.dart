import 'package:aqone/l10n/app_localizations.dart';
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
    final t = AppLocalizations.of(context);
    final accent = _accent();

    // Coordinates are numbers, not copy - they are formatted, never
    // translated. Only the "no fix" case has words in it.
    final position = record.hasFix
        ? '${record.lat!.toStringAsFixed(5)}, ${record.lon!.toStringAsFixed(5)}'
        : t.deliveryNoGpsFix;

    return Container(
      margin: const EdgeInsets.only(bottom: AqSpace.md),
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
              Text(
                record.state.title(t),
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: palette.primaryText,
                ),
              ),
              const Spacer(),
              Text(
                _formatTime(record.createdAt),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: palette.dimText,
                ),
              ),
            ],
          ),
          const SizedBox(height: AqSpace.sm),
          Text(
            record.state.description(t),
            style: TextStyle(
              fontSize: 14,
              height: 1.5,
              color: palette.secondaryText,
            ),
          ),
          const SizedBox(height: AqSpace.md),
          _MetaLine(
            label: t.deliveryMetaPosition,
            value: position,
            monospace: true,
          ),
          if (record.seq != null)
            _MetaLine(
              label: t.deliveryMetaBuoy,
              // Identifiers, not prose. Left untranslated on purpose: this is
              // what a responder reads back over the radio.
              value: 'buoy ${record.buoyId} · seq ${record.seq}',
              monospace: true,
            ),
          if (record.note != null)
            _MetaLine(label: t.deliveryMetaNote, value: record.note!),
          if (record.ackedBy != null)
            _MetaLine(label: t.deliveryMetaResponder, value: record.ackedBy!),
          if (record.state == DeliveryState.saved && record.lastError != null)
            _MetaLine(
              label: t.deliveryMetaLastAttempt,
              value: record.lastError!,
              tone: AqColors.warning,
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
            // 84 in the English-only version. Tagalog and Aklanon labels run
            // longer ("Huling subok", "Huling pagtinguha") and wrapped.
            width: 96,
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
