import 'dart:async';

import 'package:flutter/material.dart';

import '../core/tokens.dart';
import '../models/catch_record.dart';
import '../services/catch_service.dart';

/// Today's logged catches, with a way to confirm the real weight once a
/// catch has been reweighed - typically back on land, well after the quick
/// preset already synced. See [CatchRecord]'s doc comment for why weight is
/// split into an estimate and a separate confirmation in the first place.
class CatchHistoryPage extends StatefulWidget {
  const CatchHistoryPage({super.key, required this.catches});

  final CatchService catches;

  @override
  State<CatchHistoryPage> createState() => _CatchHistoryPageState();
}

class _CatchHistoryPageState extends State<CatchHistoryPage> {
  StreamSubscription<void>? _sub;
  List<CatchRecord> _catches = const <CatchRecord>[];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _sub = widget.catches.changes.listen((_) => _load());
    _load();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final rows = await widget.catches.today();
    if (!mounted) {
      return;
    }
    setState(() {
      _catches = rows;
      _loading = false;
    });
  }

  Future<void> _confirmWeight(CatchRecord record) async {
    final controller = TextEditingController(
      text: _trimZero(record.estimatedQuantityKg),
    );
    final result = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm actual weight'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              'Estimated at sea: ${_trimZero(record.estimatedQuantityKg)} kg'
              '${record.speciesName != null ? ' · ${record.speciesName}' : ''}',
              style: const TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Actual weight (kg)',
                isDense: true,
              ),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final parsed = double.tryParse(controller.text.trim());
              if (parsed == null || parsed <= 0 || !parsed.isFinite) {
                return;
              }
              Navigator.pop(ctx, parsed);
            },
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (result == null) {
      return;
    }
    try {
      await widget.catches.confirmWeight(record.localId, result);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Weight confirmed.')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not save that weight.')),
        );
      }
    }
  }

  static String _trimZero(double value) =>
      value == value.roundToDouble() ? value.toInt().toString() : '$value';

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    return Scaffold(
      backgroundColor: palette.canvas,
      appBar: AppBar(
        backgroundColor: palette.surface,
        elevation: 0,
        title: Text(
          "Today's catches",
          style: TextStyle(color: palette.primaryText, fontWeight: FontWeight.w700),
        ),
        iconTheme: IconThemeData(color: palette.primaryText),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _catches.isEmpty
                  ? ListView(
                      children: <Widget>[
                        SizedBox(height: 120),
                        Center(
                          child: Text(
                            'No catches logged today yet.',
                            style: TextStyle(color: palette.dimText),
                          ),
                        ),
                      ],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(AqSpace.screen),
                      itemCount: _catches.length,
                      separatorBuilder: (_, __) =>
                          const SizedBox(height: AqSpace.sm),
                      itemBuilder: (context, index) =>
                          _CatchTile(
                        record: _catches[index],
                        palette: palette,
                        onConfirmWeight: () => _confirmWeight(_catches[index]),
                      ),
                    ),
        ),
      ),
    );
  }
}

class _CatchTile extends StatelessWidget {
  const _CatchTile({
    required this.record,
    required this.palette,
    required this.onConfirmWeight,
  });

  final CatchRecord record;
  final AqPalette palette;
  final VoidCallback onConfirmWeight;

  @override
  Widget build(BuildContext context) {
    final species = record.speciesName?.trim();
    final label = species == null || species.isEmpty ? 'Unspecified' : species;
    final time = TimeOfDay.fromDateTime(record.createdAt).format(context);

    return Container(
      padding: const EdgeInsets.all(AqSpace.base),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AqRadius.card),
        border: Border.all(color: palette.border),
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: palette.surfaceAlt,
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.set_meal_rounded, color: palette.active, size: 20),
          ),
          const SizedBox(width: AqSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  label,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: palette.primaryText,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '~${record.estimatedQuantityKg == record.estimatedQuantityKg.roundToDouble() ? record.estimatedQuantityKg.toInt() : record.estimatedQuantityKg} kg estimated · $time',
                  style: TextStyle(fontSize: 11.5, color: palette.dimText),
                ),
                const SizedBox(height: 4),
                Row(
                  children: <Widget>[
                    Icon(
                      record.state == SyncState.synced
                          ? Icons.cloud_done_rounded
                          : record.state == SyncState.rejected
                              ? Icons.error_outline_rounded
                              : Icons.cloud_upload_outlined,
                      size: 13,
                      color: palette.secondaryText,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      record.state.title,
                      style: TextStyle(fontSize: 11, color: palette.secondaryText),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: AqSpace.sm),
          if (record.isWeightConfirmed)
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                Icon(Icons.check_circle_rounded, color: palette.active, size: 18),
                const SizedBox(height: 2),
                Text(
                  '${record.quantityKg} kg',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: palette.primaryText,
                  ),
                ),
              ],
            )
          else
            OutlinedButton(
              onPressed: onConfirmWeight,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text('Confirm', style: TextStyle(fontSize: 11.5)),
            ),
        ],
      ),
    );
  }
}
