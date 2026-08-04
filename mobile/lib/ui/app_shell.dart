import 'package:flutter/material.dart';

import '../data/identity_store.dart';
import '../services/location_service.dart';
import '../services/sos_service.dart';
import '../services/venture_feeds.dart';
import 'advisories_page.dart';
import 'home_page.dart';
import 'profile_page.dart';
import 'venture_page.dart';

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
    required this.feeds,
    required this.location,
    required this.identityStore,
    required this.themeMode,
    required this.onThemeModeChanged,
    required this.onLogout,
    required this.onIdentityUpdated,
  });

  final VesselIdentity identity;
  final SosService sos;
  final VentureFeeds feeds;
  final LocationService location;

  // Profile needs the store to save edits, and the theme handles so its
  // light/dark switch can reach MaterialApp at the app root.
  final IdentityStore identityStore;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeModeChanged;
  final VoidCallback onLogout;
  final ValueChanged<VesselIdentity> onIdentityUpdated;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

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
        ),
        // Only built once the user has actually opened Venture.
        _ventureOpened ? _buildVenture(inset) : const SizedBox.shrink(),
        AdvisoriesPage(feeds: widget.feeds, bottomInset: inset),
        ProfilePage(
          identityStore: widget.identityStore,
          identity: widget.identity,
          themeMode: widget.themeMode,
          onThemeModeChanged: widget.onThemeModeChanged,
          onLogout: widget.onLogout,
          onIdentityUpdated: widget.onIdentityUpdated,
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
              label: 'Home',
              isActive: index == 0,
              isDark: isDark,
              onTap: () => onSelect(0),
            ),
            _SidebarItem(
              icon: Icons.explore_rounded,
              label: 'Venture mode',
              isActive: index == 1,
              isDark: isDark,
              onTap: () => onSelect(1),
            ),
            _SidebarItem(
              icon: Icons.campaign_rounded,
              label: 'Advisories',
              isActive: index == 2,
              isDark: isDark,
              onTap: () => onSelect(2),
            ),
            _SidebarItem(
              icon: Icons.person_rounded,
              label: 'Profile',
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

/// Mobile dock with the Venture button raised above it, as in the mockups.
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
  ///
  /// Both the dock and the pages beneath it derive their geometry from this,
  /// so the bar cannot end up shorter than the thing drawn inside it.
  static double heightFor(BuildContext context) =>
      barHeight + MediaQuery.of(context).viewPadding.bottom + overhang;

  @override
  Widget build(BuildContext context) {
    // Padded explicitly rather than with SafeArea: a SafeArea inside a
    // fixed-height box adds inset to the content without growing the box,
    // which is what overflowed the dock on phones with a home indicator.
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
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: <Widget>[
                _DockItem(
                  icon: Icons.home_rounded,
                  label: 'Home',
                  isActive: index == 0,
                  isDark: isDark,
                  onTap: () => onSelect(0),
                ),
                // Reserved gap for the raised Venture button.
                const SizedBox(width: 72),
                _DockItem(
                  icon: Icons.campaign_rounded,
                  label: 'Advisories',
                  isActive: index == 2,
                  isDark: isDark,
                  onTap: () => onSelect(2),
                ),
                _DockItem(
                  icon: Icons.person_rounded,
                  label: 'Profile',
                  isActive: index == 3,
                  isDark: isDark,
                  onTap: () => onSelect(3),
                ),
              ],
            ),
          ),
          Positioned(
            // Sits centred on the bar's top edge, so its top lands exactly on
            // the stack's top rather than spilling past it.
            bottom: fullBarHeight - overhang,
            child: Semantics(
              button: true,
              label: 'Venture mode',
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
