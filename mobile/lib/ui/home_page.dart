import 'dart:async';

import 'package:flutter/material.dart';

import '../core/config.dart';
import '../core/tokens.dart';
import '../data/identity_store.dart';
import '../models/buoy_contact.dart';
import '../models/sos_record.dart';
import '../services/sos_service.dart';
import 'widgets/buoy_status_card.dart';
import 'widgets/delivery_state_tile.dart';

class HomePage extends StatefulWidget {
  const HomePage({
    super.key,
    required this.service,
    required this.identity,
  });

  final SosService service;
  final VesselIdentity identity;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  List<SosRecord> _records = const <SosRecord>[];
  BuoyStatus? _buoy;
  Timer? _buoyTimer;
  StreamSubscription<void>? _changes;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _changes = widget.service.changes.listen((_) => _loadRecords());
    widget.service.start();
    _loadRecords();
    _pollBuoy();
    _buoyTimer = Timer.periodic(
      AqOneConfig.buoyPollInterval,
      (_) => _pollBuoy(),
    );
  }

  @override
  void dispose() {
    _buoyTimer?.cancel();
    _changes?.cancel();
    super.dispose();
  }

  Future<void> _loadRecords() async {
    final records = await widget.service.history();
    if (!mounted) {
      return;
    }
    setState(() => _records = records);
  }

  Future<void> _pollBuoy() async {
    final status = await widget.service.pollBuoy();
    if (!mounted) {
      return;
    }
    setState(() => _buoy = status);
  }

  Future<void> _confirmAndSend() async {
    final note = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Send an SOS?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const Text(
                'This alerts the MDRRMO once it reaches shore. Only send it '
                'if you need help.',
              ),
              const SizedBox(height: AqSpace.base),
              TextField(
                controller: note,
                maxLength: AqOneConfig.maxNoteLength,
                decoration: const InputDecoration(
                  labelText: 'What is wrong? (optional)',
                  hintText: 'engine down',
                  counterText: '',
                ),
              ),
            ],
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AqColors.danger,
              ),
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Send SOS'),
            ),
          ],
        );
      },
    );

    final text = note.text;
    note.dispose();

    if (confirmed != true) {
      return;
    }

    if (!mounted) {
      return;
    }
    setState(() => _sending = true);
    try {
      await widget.service.raiseSos(note: text);
    } finally {
      if (mounted) {
        setState(() => _sending = false);
        await _loadRecords();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    return Scaffold(
      backgroundColor: palette.canvas,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            await _pollBuoy();
            await widget.service.retryPending();
            await widget.service.reconcile();
            await _loadRecords();
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              AqSpace.screen,
              AqSpace.lg,
              AqSpace.screen,
              AqSpace.xl,
            ),
            children: <Widget>[
              Text(
                widget.identity.boat,
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.5,
                  color: palette.primaryText,
                ),
              ),
              const SizedBox(height: AqSpace.xs),
              Text(
                'AqOne distress beacon',
                style: TextStyle(
                  fontSize: 14,
                  color: palette.secondaryText,
                ),
              ),
              const SizedBox(height: AqSpace.lg),
              BuoyStatusCard(status: _buoy),
              const SizedBox(height: AqSpace.screen),
              _SosButton(busy: _sending, onPressed: _confirmAndSend),
              const SizedBox(height: AqSpace.screen),
              Text(
                'Your messages',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: palette.primaryText,
                ),
              ),
              const SizedBox(height: AqSpace.md),
              if (_records.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: AqSpace.xl),
                  child: Text(
                    'No SOS sent yet.',
                    style: TextStyle(fontSize: 14, color: palette.dimText),
                  ),
                )
              else
                ..._records.map(
                  (record) => DeliveryStateTile(record: record),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SosButton extends StatelessWidget {
  const _SosButton({required this.busy, required this.onPressed});

  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 168,
      child: Material(
        color: AqColors.danger,
        borderRadius: BorderRadius.circular(AqRadius.large),
        child: InkWell(
          borderRadius: BorderRadius.circular(AqRadius.large),
          onTap: busy ? null : onPressed,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                const Icon(Icons.sos_rounded, size: 56, color: Colors.white),
                const SizedBox(height: AqSpace.sm),
                Text(
                  busy ? 'Sending…' : 'Send SOS',
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
