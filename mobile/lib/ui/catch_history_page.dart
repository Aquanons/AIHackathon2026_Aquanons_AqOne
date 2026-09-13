import 'dart:async';

import 'package:aqone/l10n/app_localizations.dart';
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

String _trimZero(double value) =>
    value == value.roundToDouble() ? value.toInt().toString() : '$value';

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
    final t = AppLocalizations.of(context);
    final controller = TextEditingController(
      text: _trimZero(record.estimatedQuantityKg),
    );
    final species = record.speciesName != null ? ' · ${record.speciesName}' : '';
    final result = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        // The weight field autofocuses, which pops the keyboard right as
        // the dialog lays out. Without `scrollable`, AlertDialog gives
        // `content` a fixed-size Column with no way to shrink when that
        // sudden inset change lands mid-layout, which overflows. Wrapping
        // content in a scroll view (what `scrollable: true` does) lets it
        // adapt instead.
        scrollable: true,
        title: Text(t.catchConfirmWeightTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              t.catchEstimatedAtSeaLabel(_trimZero(record.estimatedQuantityKg), species),
              style: const TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: t.catchActualWeightLabel,
                isDense: true,
              ),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(t.actionCancel),
          ),
          FilledButton(
            onPressed: () {
              final parsed = double.tryParse(controller.text.trim());
              if (parsed == null || parsed <= 0 || !parsed.isFinite) {
                return;
              }
              Navigator.pop(ctx, parsed);
            },
            child: Text(t.catchDialogConfirm),
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
          SnackBar(content: Text(AppLocalizations.of(context).catchWeightConfirmedSnackbar)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context).catchWeightSaveFailedSnackbar)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final palette = AqPalette.of(context);
    return Scaffold(
      backgroundColor: palette.canvas,
      appBar: AppBar(
        backgroundColor: palette.surface,
        elevation: 0,
        title: Text(
          t.catchTodayCatchesTitle,
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
                        const SizedBox(height: 120),
                        Center(
                          child: Text(
                            t.catchNoCatchesToday,
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
    final t = AppLocalizations.of(context);
    final species = record.speciesName?.trim();
    final label = species == null || species.isEmpty ? t.catchSpeciesUnspecified : species;
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
                  t.catchEstimatedSummary(_trimZero(record.estimatedQuantityKg), time),
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
                      record.state.title(t),
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
              child: Text(t.catchDialogConfirm, style: const TextStyle(fontSize: 11.5)),
            ),
        ],
      ),
    );
  }
}
