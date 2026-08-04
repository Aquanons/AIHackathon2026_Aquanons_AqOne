import 'package:flutter/material.dart';

import '../core/tokens.dart';
import '../models/advisory.dart';
import '../services/venture_feeds.dart';
import 'widgets/advisory_card.dart';
import 'widgets/brand_header.dart';

/// Published advisories from the MDRRMO and LGU.
///
/// Sorted most urgent first, then most recent. Expired notices are filtered
/// out, treating the expiration date as inclusive.
class AdvisoriesPage extends StatefulWidget {
  const AdvisoriesPage({
    super.key,
    required this.feeds,
    this.bottomInset = 0,
  });

  final VentureFeeds feeds;
  final double bottomInset;

  @override
  State<AdvisoriesPage> createState() => _AdvisoriesPageState();
}

class _AdvisoriesPageState extends State<AdvisoriesPage> {
  List<Advisory> _advisories = const <Advisory>[];
  bool _loading = true;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() => _loading = true);
    }
    final advisories = await widget.feeds.advisories();
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = false;
      // Distinguish "the request failed" from "there are none right now".
      // Showing "no advisories" after a network error would imply an
      // all-clear that nobody actually gave.
      _failed = advisories == null;
      if (advisories != null) {
        _advisories = advisories;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    return Scaffold(
      backgroundColor: palette.canvas,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _load,
          child: _buildBody(palette),
        ),
      ),
    );
  }

  Widget _buildBody(AqPalette palette) {
    if (_loading && _advisories.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    return ListView(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 32 + widget.bottomInset),
      children: <Widget>[
        const BrandHeader(),
        const SizedBox(height: 16),
        Row(
          children: <Widget>[
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: <Color>[
                    AqColors.skyAccent,
                    AqColors.brandPrimary,
                  ],
                ),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(
                Icons.campaign_rounded,
                color: Colors.white,
                size: 24,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    'Advisories',
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w900,
                      color: palette.primaryText,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Notices from the MDRRMO and your LGU.',
                    style: TextStyle(
                      fontSize: 13,
                      color: palette.secondaryText,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        if (_failed && _advisories.isEmpty)
          _Placeholder(
            icon: Icons.cloud_off_rounded,
            title: 'Could not load advisories',
            body: 'Check your connection and pull down to try again.',
            palette: palette,
          )
        else if (_advisories.isEmpty)
          _Placeholder(
            icon: Icons.inbox_rounded,
            title: 'No active advisories',
            body: 'Nothing is currently in force for your area.',
            palette: palette,
          )
        else ...<Widget>[
          if (_failed)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'Showing the last loaded list - refresh failed.',
                style: TextStyle(
                  fontSize: 12,
                  fontStyle: FontStyle.italic,
                  color: palette.dimText,
                ),
              ),
            ),
          for (final advisory in _advisories)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: AdvisoryCard(
                advisory: advisory,
                maxDescriptionLines: 6,
              ),
            ),
        ],
      ],
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({
    required this.icon,
    required this.title,
    required this.body,
    required this.palette,
  });

  final IconData icon;
  final String title;
  final String body;
  final AqPalette palette;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        children: <Widget>[
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: palette.dimText.withValues(alpha: 0.10),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 32, color: palette.dimText),
          ),
          const SizedBox(height: 14),
          Text(
            title,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: palette.primaryText,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            body,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              color: palette.secondaryText,
            ),
          ),
        ],
      ),
    );
  }
}
