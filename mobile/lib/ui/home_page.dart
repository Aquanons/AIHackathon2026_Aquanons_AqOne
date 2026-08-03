import 'dart:async';

import 'package:flutter/material.dart';

import '../core/config.dart';
import '../core/tokens.dart';
import '../data/identity_store.dart';
import '../models/advisory.dart';
import '../models/buoy_contact.dart';
import '../models/sea_condition.dart';
import '../models/sos_record.dart';
import '../services/sos_service.dart';
import '../services/venture_feeds.dart';
import 'widgets/advisory_card.dart';
import 'widgets/buoy_status_card.dart';
import 'widgets/delivery_state_tile.dart';
import 'widgets/sea_condition_banner.dart';

class HomePage extends StatefulWidget {
  const HomePage({
    super.key,
    required this.service,
    required this.identity,
    required this.feeds,
    this.bottomInset = 0,
    this.onOpenAdvisories,
  });

  final SosService service;
  final VesselIdentity identity;
  final VentureFeeds feeds;

  /// Space reserved for the shell's floating dock, so the last card is not
  /// hidden underneath it.
  final double bottomInset;

  /// Opens the full advisories list. Null hides the "View all" action rather
  /// than leaving a control that navigates nowhere.
  final VoidCallback? onOpenAdvisories;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  List<SosRecord> _records = const <SosRecord>[];
  BuoyStatus? _buoy;
  Timer? _buoyTimer;
  Timer? _seaTimer;
  StreamSubscription<void>? _changes;
  bool _sending = false;

  SeaCondition? _sea;
  bool _seaLoading = true;
  List<Advisory> _advisories = const <Advisory>[];

  @override
  void initState() {
    super.initState();
    _changes = widget.service.changes.listen((_) => _loadRecords());
    widget.service.start();
    _loadRecords();
    _pollBuoy();
    _loadSea();
    _loadAdvisories();
    _buoyTimer = Timer.periodic(
      AqOneConfig.buoyPollInterval,
      (_) => _pollBuoy(),
    );
    _seaTimer = Timer.periodic(
      AqOneConfig.seaConditionInterval,
      (_) => _loadSea(),
    );
  }

  @override
  void dispose() {
    _buoyTimer?.cancel();
    _seaTimer?.cancel();
    _changes?.cancel();
    super.dispose();
  }

  /// A failed refresh keeps the last known value on screen. The banner marks
  /// it as possibly outdated rather than blanking - during bad weather, an
  /// old "not advised" is far more useful than no reading at all.
  Future<void> _loadSea() async {
    final sea = await widget.feeds.seaCondition();
    if (!mounted) {
      return;
    }
    setState(() {
      _seaLoading = false;
      if (sea != null) {
        _sea = sea;
      }
    });
  }

  Future<void> _loadAdvisories() async {
    final advisories = await widget.feeds.advisories();
    if (!mounted || advisories == null) {
      return;
    }
    setState(() => _advisories = advisories);
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
            await _loadSea();
            await _loadAdvisories();
            await widget.service.retryPending();
            await widget.service.reconcile();
            await _loadRecords();
          },
          child: ListView(
            padding: EdgeInsets.fromLTRB(
              AqSpace.screen,
              AqSpace.lg,
              AqSpace.screen,
              AqSpace.xl + widget.bottomInset,
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
              // The official call sits above everything else on the screen.
              SeaConditionBanner(condition: _sea, isLoading: _seaLoading),
              if (_advisories.isNotEmpty) ...<Widget>[
                const SizedBox(height: AqSpace.base),
                AdvisoryCard(
                  advisory: _advisories.first,
                  remaining: _advisories.length - 1,
                  onViewAll: widget.onOpenAdvisories,
                ),
              ],
              const SizedBox(height: AqSpace.base),
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
