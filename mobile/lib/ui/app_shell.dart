import 'package:flutter/material.dart';

import '../data/identity_store.dart';
import '../services/location_service.dart';
import '../services/sos_service.dart';
import '../services/venture_feeds.dart';
import 'advisories_page.dart';
import 'home_page.dart';
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
    required this.identityStore,
    required this.sos,
    required this.feeds,
    required this.location,
    required this.themeMode,
    this.onThemeModeChanged,
    this.onLogout,
    this.onIdentityUpdated,
  });

  final VesselIdentity identity;
  final IdentityStore identityStore;
  final SosService sos;
  final VentureFeeds feeds;
  final LocationService location;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode>? onThemeModeChanged;
  final VoidCallback? onLogout;
  final ValueChanged<VesselIdentity>? onIdentityUpdated;

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
          identityStore: widget.identityStore,
          feeds: widget.feeds,
          location: widget.location,
          bottomInset: inset,
          onOpenAdvisories: () => _select(2),
          themeMode: widget.themeMode,
          onThemeModeChanged: widget.onThemeModeChanged,
          onLogout: widget.onLogout,
          onIdentityUpdated: widget.onIdentityUpdated,
        ),
        // Only built once the user has actually opened Venture.
        _ventureOpened ? _buildVenture(inset) : const SizedBox.shrink(),
        AdvisoriesPage(feeds: widget.feeds, bottomInset: inset),
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
      decoration: BoxDecoration(
        color: isDark ? _surfaceDark : Colors.white,
        border: Border(
          right: BorderSide(
            color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
          ),
        ),
      ),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            const SizedBox(height: 28),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Row(
                children: <Widget>[
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: <Color>[_accentDark, _brandPrimary],
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      Icons.waves_rounded,
                      size: 20,
                      color: isDark ? _surfaceDark : Colors.white,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'AqOne',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.5,
                      color: isDark ? Colors.white : _brandPrimary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 26),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(
                'MENU',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                  color: isDark ? Colors.white38 : const Color(0xFF94A3B8),
                ),
              ),
            ),
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
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
            child: Row(
              children: <Widget>[
                Icon(
                  icon,
                  size: 21,
                  color: isActive
                      ? active
                      : (isDark ? Colors.white70 : const Color(0xFF64748B)),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: isActive ? FontWeight.w800 : FontWeight.w500,
                      color: isActive
                          ? active
                          : (isDark ? Colors.white70 : const Color(0xFF334155)),
                    ),
                  ),
                ),
                if (isActive)
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: active,
                      shape: BoxShape.circle,
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
    final ventureActive = index == 1;

    return SizedBox(
      height: fullBarHeight + overhang,
      child: Stack(
        alignment: Alignment.bottomCenter,
        clipBehavior: Clip.none,
        children: <Widget>[
          Container(
            height: fullBarHeight,
            margin: const EdgeInsets.symmetric(horizontal: 12),
            padding: EdgeInsets.only(bottom: systemInset),
            decoration: BoxDecoration(
              color: (isDark ? _surfaceDark : Colors.white).withValues(
                alpha: isDark ? 0.92 : 0.96,
              ),
              borderRadius: BorderRadius.circular(30),
              border: Border.all(
                color: (isDark ? _accentDark : Colors.white)
                    .withValues(alpha: 0.28),
              ),
              boxShadow: <BoxShadow>[
                BoxShadow(
                  color: Colors.black.withValues(alpha: isDark ? 0.4 : 0.14),
                  blurRadius: 24,
                  offset: const Offset(0, -6),
                ),
                BoxShadow(
                  color: _brandPrimary.withValues(alpha: 0.10),
                  blurRadius: 40,
                  offset: const Offset(0, 4),
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
                const SizedBox(width: 76),
                _DockItem(
                  icon: Icons.campaign_rounded,
                  label: 'Advisories',
                  isActive: index == 2,
                  isDark: isDark,
                  onTap: () => onSelect(2),
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
                    gradient: ventureActive
                        ? const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: <Color>[Color(0xFF0284C7), _brandPrimary],
                          )
                        : const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: <Color>[_accentDark, _brandPrimary],
                          ),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: isDark ? _surfaceDark : Colors.white,
                      width: 4,
                    ),
                    boxShadow: <BoxShadow>[
                      BoxShadow(
                        color: _brandPrimary.withValues(alpha: 0.45),
                        blurRadius: 18,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: <Widget>[
                      Icon(
                        Icons.explore_rounded,
                        color: Colors.white.withValues(alpha: 0.95),
                        size: 30,
                      ),
                      if (ventureActive)
                        Positioned(
                          bottom: 12,
                          child: Container(
                            width: 5,
                            height: 5,
                            decoration: const BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                    ],
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
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: isActive
                    ? active.withValues(alpha: 0.14)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, size: 24, color: color),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: isActive ? FontWeight.w800 : FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
