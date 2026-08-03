import 'package:flutter/material.dart';

/// An animated marker for a community fishing spot.
///
/// Two offset ripples give the pin a sonar-like pulse. Tap (or hover on
/// desktop) reveals who posted it and how long ago.
///
/// These mark spots other fishermen have reported. They are not predictions.
class RippleFishSpot extends StatefulWidget {
  const RippleFishSpot({
    super.key,
    this.postedBy,
    this.timeAgo,
  });

  final String? postedBy;
  final String? timeAgo;

  @override
  State<RippleFishSpot> createState() => _RippleFishSpotState();
}

class _RippleFishSpotState extends State<RippleFishSpot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  bool _isOpen = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final postedBy = widget.postedBy ?? 'Anonymous';
    final timeAgo = widget.timeAgo ?? 'Just now';

    return MouseRegion(
      onEnter: (_) => setState(() => _isOpen = true),
      onExit: (_) => setState(() => _isOpen = false),
      child: GestureDetector(
        onTap: () => setState(() => _isOpen = !_isOpen),
        child: Semantics(
          button: true,
          label: 'Fishing spot posted by $postedBy, $timeAgo',
          child: Stack(
            alignment: Alignment.center,
            clipBehavior: Clip.none,
            children: <Widget>[
              SizedBox(
                width: 50,
                height: 50,
                child: OverflowBox(
                  maxWidth: 80,
                  maxHeight: 80,
                  child: AnimatedBuilder(
                    animation: _controller,
                    builder: (context, _) {
                      final near = _controller.value;
                      final far = (near + 0.5) % 1.0;
                      return Stack(
                        alignment: Alignment.center,
                        children: <Widget>[
                          _Ripple(
                            progress: far,
                            color: const Color(0xFF38BDF8),
                            fillOpacity: 0.35,
                          ),
                          _Ripple(
                            progress: near,
                            color: const Color(0xFF0077FF),
                            fillOpacity: 0.4,
                          ),
                          Icon(
                            Icons.location_on_rounded,
                            color: _isOpen
                                ? const Color(0xFF0284C7)
                                : const Color(0xFF0066EE),
                            size: _isOpen ? 38 : 32,
                          ),
                        ],
                      );
                    },
                  ),
                ),
              ),
              if (_isOpen)
                Positioned(
                  bottom: 45,
                  child: _SpotPopup(postedBy: postedBy, timeAgo: timeAgo),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Ripple extends StatelessWidget {
  const _Ripple({
    required this.progress,
    required this.color,
    required this.fillOpacity,
  });

  final double progress;
  final Color color;
  final double fillOpacity;

  @override
  Widget build(BuildContext context) {
    final fade = (1.0 - progress).clamp(0.0, 1.0);
    return Transform.scale(
      scale: 0.8 + (progress * 0.9),
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: color.withValues(alpha: fade),
            width: 2,
          ),
          color: color.withValues(alpha: (fillOpacity * fade).clamp(0.0, 1.0)),
        ),
      ),
    );
  }
}

class _SpotPopup extends StatelessWidget {
  const _SpotPopup({required this.postedBy, required this.timeAgo});

  final String postedBy;
  final String timeAgo;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF38BDF8), width: 1.5),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Container(
            padding: const EdgeInsets.all(6),
            decoration: const BoxDecoration(
              color: Color(0xFF0284C7),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.phishing_rounded,
              size: 18,
              color: Colors.white,
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                postedBy,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                timeAgo,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF38BDF8),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
