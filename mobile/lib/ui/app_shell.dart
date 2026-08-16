import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';

import '../core/locale_controller.dart';
import '../data/checklist_store.dart';
import '../data/identity_store.dart';
import '../models/delivery_state.dart';
import '../models/sos_record.dart';
import '../services/catch_service.dart';
import '../services/location_service.dart';
import '../services/sos_service.dart';
import '../services/venture_feeds.dart';
import 'advisories_page.dart';
import 'home_page.dart';
import 'profile_page.dart';
import 'venture_page.dart';
import 'widgets/responder_eta_dialog.dart';


const Color _brandPrimary = Color(0xFF0F69C9);
const Color _accentDark = Color(0xFF38BDF8);
const Color _surfaceDark = Color(0xFF1E293B);

/// Desktop layout kicks in at this width, matching the source project.
const double kDesktopBreakpoint = 900;

/// Navigation shell holding the app's destinations.
///
/// Venture is created lazily on first visit and then kept alive, so the map
/// camera, checklist and in-flight state survive tab switches. Rebuilding it
/// each time would reset the map and re-prompt for GPS.
class AppShell extends StatefulWidget {
  const AppShell({
    super.key,
    required this.identity,
    required this.sos,
    required this.catches,
    required this.checklist,
    required this.feeds,
    required this.location,
    required this.identityStore,
    required this.themeMode,
    required this.onThemeModeChanged,
    this.localeController,
    required this.onLogout,
    required this.onIdentityUpdated,
  });

  final VesselIdentity identity;
  final SosService sos;
  final CatchService catches;
  final ChecklistStore checklist;
  final VentureFeeds feeds;
  final LocationService location;

  // Profile needs the store to save edits, and the theme handles so its
  // light/dark switch can reach MaterialApp at the app root.
  final IdentityStore identityStore;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeModeChanged;

  // Passed straight through to Profile, which owns the language row. Held at
  // the app root for the same reason as themeMode: changing it has to rebuild
  // MaterialApp, not just this subtree.
  final LocaleController? localeController;

  final VoidCallback onLogout;
  final ValueChanged<VesselIdentity> onIdentityUpdated;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  // ---- Responder acknowledgement watcher -----------------------------------
  //
  // The dispatcher's ETA reached the local database and nothing ever read it,
  // so a fisher was never told help was coming. It is watched here, at the
  // shell, rather than on any one page: an acknowledgement must surface
  // wherever the fisher happens to be looking.

  StreamSubscription<void>? _sosChanges;

  /// localIds already announced, so switching tabs or a routine outbox poll
  /// does not re-open the dialog for an acknowledgement already seen.
  final Set<String> _announced = <String>{};

  bool _dialogOpen = false;

  /// True from the moment a check starts until it has either found nothing
  /// or committed to opening a dialog.
  ///
  /// [_dialogOpen] alone is not enough to prevent duplicates: it is only set
  /// true *after* `await widget.sos.history()` below, so a burst of
  /// `sos.changes` events (routine during an ack/outbox flush) can start
  /// several overlapping calls that all pass the `_dialogOpen` check before
  /// any of them sets it, each independently scheduling its own dialog for
  /// the same acknowledgement. This flag closes that window by being set
  /// synchronously, before the first `await`.
  bool _checkingAcknowledgement = false;

  @override
  void initState() {
    super.initState();
    _sosChanges = widget.sos.changes.listen((_) => _checkForAcknowledgement());
    _checkForAcknowledgement();
  }

  @override
  void dispose() {
    _sosChanges?.cancel();
    super.dispose();
  }

  Future<void> _checkForAcknowledgement() async {
    if (!mounted || _dialogOpen || _checkingAcknowledgement) {
      return;
    }
    _checkingAcknowledgement = true;

    try {
      final records = await widget.sos.history();
      if (!mounted) {
        return;
      }

      SosRecord? pending;
      for (final record in records) {
        final acknowledged = record.state == DeliveryState.acknowledged ||
            record.etaAt != null;
        if (acknowledged && !_announced.contains(record.localId)) {
          pending = record;
          break;
        }
      }

      if (pending == null) {
        return;
      }

      _announced.add(pending.localId);
      _dialogOpen = true;

      // Scheduled after the current frame so this can safely fire from a
      // stream callback during a build without tripping a
      // setState-during-build error.
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted) {
          _dialogOpen = false;
          return;
        }
        await showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (_) => ResponderEtaDialog(record: pending!),
        );
        _dialogOpen = false;
      });
    } finally {
      _checkingAcknowledgement = false;
    }
  }

  /// Venture is not built until the user first opens it, so entering the app
  /// does not immediately prompt for GPS or start polling.
  ///
  /// Once built it keeps its State: it stays at the same position in the
  /// IndexedStack's child list, so rebuilding the widget (on rotation, say)
  /// reuses the existing State and the map camera and checklist survive.
  bool _ventureOpened = false;

  Widget _buildVenture(double bottomInset) {
    return VenturePage(
      identity: widget.identity,
      sos: widget.sos,
      catches: widget.catches,
      checklist: widget.checklist,
      feeds: widget.feeds,
      location: widget.location,
      bottomInset: bottomInset,
    );
  }

  void _select(int index) {
    if (index == _index) {
      return;
    }
    setState(() {
      _index = index;
      if (index == 1) {
        _ventureOpened = true;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.of(context).size.width >= kDesktopBreakpoint;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // The desktop sidebar sits beside the content, so nothing overlaps it.
    final inset = isWide ? 0.0 : _MobileDock.heightFor(context);

    // Every slot here renders a real screen. The source project left two
    // destinations wired to blank widgets, so Home's "View More" opened an
    // empty page - the single worst bug to hit during a demo.
    final body = IndexedStack(
      index: _index,
      children: <Widget>[
        HomePage(
          service: widget.sos,
          identity: widget.identity,
          feeds: widget.feeds,
          location: widget.location,
          bottomInset: inset,
          onOpenAdvisories: () => _select(2),
          onOpenProfile: () => _select(3),
        ),
        // Only built once the user has actually opened Venture.
        _ventureOpened ? _buildVenture(inset) : const SizedBox.shrink(),
        AdvisoriesPage(feeds: widget.feeds, bottomInset: inset),
        ProfilePage(
          identityStore: widget.identityStore,
          identity: widget.identity,
          themeMode: widget.themeMode,
          onThemeModeChanged: widget.onThemeModeChanged,
          localeController: widget.localeController,
          onLogout: widget.onLogout,
          onIdentityUpdated: widget.onIdentityUpdated,
          onOpenHome: () => _select(0),
          bottomInset: inset,
        ),
      ],
    );

    if (isWide) {
      return Scaffold(
        body: Row(
          children: <Widget>[
            _Sidebar(index: _index, onSelect: _select, isDark: isDark),
            Expanded(child: body),
          ],
        ),
      );
    }

    return Scaffold(
      body: Stack(
        children: <Widget>[
          Positioned.fill(child: body),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _MobileDock(
              index: _index,
              onSelect: _select,
              isDark: isDark,
            ),
          ),
        ],
      ),
    );
  }
}

class _Sidebar extends StatelessWidget {
  const _Sidebar({
    required this.index,
    required this.onSelect,
    required this.isDark,
  });

  final int index;
  final ValueChanged<int> onSelect;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 250,
      color: isDark ? _surfaceDark : Colors.white,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                'AqOne',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                  color: isDark ? Colors.white : _brandPrimary,
                ),
              ),
            ),
            const SizedBox(height: 28),
            _SidebarItem(
              icon: Icons.home_rounded,
              label: AppLocalizations.of(context).navHome,
              isActive: index == 0,
              isDark: isDark,
              onTap: () => onSelect(0),
            ),
            _SidebarItem(
              icon: Icons.explore_rounded,
              label: AppLocalizations.of(context).navVenture,
              isActive: index == 1,
              isDark: isDark,
              onTap: () => onSelect(1),
            ),
            _SidebarItem(
              icon: Icons.campaign_rounded,
              label: AppLocalizations.of(context).navAdvisories,
              isActive: index == 2,
              isDark: isDark,
              onTap: () => onSelect(2),
            ),
            _SidebarItem(
              icon: Icons.person_rounded,
              label: AppLocalizations.of(context).navProfile,
              isActive: index == 3,
              isDark: isDark,
              onTap: () => onSelect(3),
            ),
            const Spacer(),
          ],
        ),
      ),
    );
  }
}

class _SidebarItem extends StatelessWidget {
  const _SidebarItem({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.isDark,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool isActive;
  final bool isDark;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final active = isDark ? _accentDark : _brandPrimary;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Material(
        color: isActive ? active.withValues(alpha: 0.12) : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: <Widget>[
                Icon(
                  icon,
                  size: 20,
                  color: isActive
                      ? active
                      : (isDark ? Colors.white70 : const Color(0xFF64748B)),
                ),
                const SizedBox(width: 12),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                    color: isActive
                        ? active
                        : (isDark ? Colors.white70 : const Color(0xFF334155)),
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

/// Mobile dock with the Venture button raised above it.
class _MobileDock extends StatelessWidget {
  const _MobileDock({
    required this.index,
    required this.onSelect,
    required this.isDark,
  });

  final int index;
  final ValueChanged<int> onSelect;
  final bool isDark;

  /// Height of the bar itself, excluding the system inset below it.
  static const double barHeight = 78;

  /// How far the Venture circle rises above the bar.
  static const double overhang = 33;

  static const double buttonSize = 66;

  /// Total space the dock occupies, including the home-indicator inset.
  static double heightFor(BuildContext context) =>
      barHeight + MediaQuery.of(context).viewPadding.bottom + overhang;

  @override
  Widget build(BuildContext context) {
    final systemInset = MediaQuery.of(context).viewPadding.bottom;
    final fullBarHeight = barHeight + systemInset;

    return SizedBox(
      height: fullBarHeight + overhang,
      child: Stack(
        alignment: Alignment.bottomCenter,
        clipBehavior: Clip.none,
        children: <Widget>[
          Container(
            height: fullBarHeight,
            padding: EdgeInsets.only(bottom: systemInset),
            decoration: BoxDecoration(
              color: isDark ? _surfaceDark : Colors.white,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(24),
              ),
              boxShadow: <BoxShadow>[
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.12),
                  blurRadius: 16,
                  offset: const Offset(0, -4),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: <Widget>[
                Expanded(
                  child: Center(
                    child: _DockItem(
                      icon: Icons.home_rounded,
                      label: AppLocalizations.of(context).navHome,
                      isActive: index == 0,
                      isDark: isDark,
                      onTap: () => onSelect(0),
                    ),
                  ),
                ),
                // Reserved gap for the raised Venture button.
                const SizedBox(width: 72),
                Expanded(
                  child: Center(
                    child: _DockItem(
                      icon: Icons.campaign_rounded,
                      label: AppLocalizations.of(context).navAdvisories,
                      isActive: index == 2,
                      isDark: isDark,
                      onTap: () => onSelect(2),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            bottom: fullBarHeight - overhang,
            child: Semantics(
              button: true,
              label: AppLocalizations.of(context).navVenture,
              child: GestureDetector(
                onTap: () => onSelect(1),
                child: Container(
                  width: buttonSize,
                  height: buttonSize,
                  decoration: BoxDecoration(
                    color: index == 1 ? const Color(0xFF0284C7) : _brandPrimary,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: isDark ? _surfaceDark : Colors.white,
                      width: 4,
                    ),
                    boxShadow: <BoxShadow>[
                      BoxShadow(
                        color: _brandPrimary.withValues(alpha: 0.4),
                        blurRadius: 14,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.explore_rounded,
                    color: Colors.white,
                    size: 30,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DockItem extends StatelessWidget {
  const _DockItem({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.isDark,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool isActive;
  final bool isDark;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final active = isDark ? _accentDark : _brandPrimary;
    final color =
        isActive ? active : (isDark ? Colors.white60 : const Color(0xFF94A3B8));
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 22, color: color),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}