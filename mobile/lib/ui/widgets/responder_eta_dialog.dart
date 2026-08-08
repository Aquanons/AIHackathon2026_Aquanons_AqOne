import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/sos_record.dart';

/// The dispatcher's answer to a distress call, shown wherever the fisher is.
///
/// This is the moment the whole product exists for: the difference between
/// "someone might have seen my SOS" and "help is 20 minutes away". It is
/// deliberately a barrier-dismissible-false dialog rather than a snackbar,
/// because a fisher glancing at a phone in bad weather must not be able to
/// miss it by looking away for three seconds.
class ResponderEtaDialog extends StatefulWidget {
  const ResponderEtaDialog({super.key, required this.record});

  final SosRecord record;

  @override
  State<ResponderEtaDialog> createState() => _ResponderEtaDialogState();
}

class _ResponderEtaDialogState extends State<ResponderEtaDialog> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    // Live countdown. One second is not wasteful here - this dialog is on
    // screen for a few seconds at a time.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  /// Never renders a negative number. Once the promised time passes it says
  /// the responder is delayed but still coming, because a countdown expiring
  /// into silence reads as "nobody is coming".
  String _countdown(DateTime eta) {
    final remaining = eta.difference(DateTime.now());
    if (remaining.isNegative) {
      return 'Delayed — still on the way';
    }
    final minutes = remaining.inMinutes;
    final seconds = remaining.inSeconds % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final eta = widget.record.etaTime;
    final overdue = eta != null && eta.isBefore(DateTime.now());
    final accent = overdue ? const Color(0xFFF59E0B) : const Color(0xFF16A34A);

    return AlertDialog(
      backgroundColor: isDark ? const Color(0xFF111827) : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Row(
        children: <Widget>[
          Icon(Icons.verified_rounded, color: accent, size: 26),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Help is coming',
              style: TextStyle(
                color: accent,
                fontWeight: FontWeight.w900,
                fontSize: 20,
              ),
            ),
          ),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            'MDRRMO has received your SOS.',
            style: TextStyle(
              fontSize: 15,
              color: isDark ? Colors.white : const Color(0xFF1F2937),
            ),
          ),
          if (eta != null) ...<Widget>[
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: accent),
              ),
              child: Column(
                children: <Widget>[
                  Text(
                    overdue ? 'ARRIVAL OVERDUE' : 'ARRIVING IN',
                    style: TextStyle(
                      fontSize: 11,
                      letterSpacing: 1,
                      fontWeight: FontWeight.w800,
                      color: accent,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _countdown(eta),
                    style: TextStyle(
                      fontSize: overdue ? 16 : 34,
                      fontWeight: FontWeight.w900,
                      color: accent,
                      fontFeatures: const <FontFeature>[
                        FontFeature.tabularFigures(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (widget.record.responderNote != null &&
              widget.record.responderNote!.trim().isNotEmpty) ...<Widget>[
            const SizedBox(height: 14),
            Text(
              widget.record.responderNote!,
              style: TextStyle(
                fontSize: 13,
                height: 1.35,
                color: isDark ? Colors.white70 : const Color(0xFF475569),
              ),
            ),
          ],
          const SizedBox(height: 14),
          Text(
            'Stay with your boat if it is still afloat. It is easier to spot '
            'than a person in the water.',
            style: TextStyle(
              fontSize: 12,
              height: 1.35,
              color: isDark ? Colors.white60 : const Color(0xFF64748B),
            ),
          ),
        ],
      ),
      actions: <Widget>[
        FilledButton(
          onPressed: () => Navigator.of(context).pop(),
          style: FilledButton.styleFrom(backgroundColor: accent),
          child: const Text('Understood'),
        ),
      ],
    );
  }
}
