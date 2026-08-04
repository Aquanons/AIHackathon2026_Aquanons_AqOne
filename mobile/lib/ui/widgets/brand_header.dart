import 'package:flutter/material.dart';

import '../../core/tokens.dart';

/// The AqOne brand mark: the wave glyph next to the wordmark.
class BrandHeader extends StatelessWidget {
  const BrandHeader({super.key, this.scale = 1});

  final double scale;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset(
          'icons/aqoneLogo2.png',
          height: 44 * scale,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Icon(
            Icons.waves_rounded,
            size: 44 * scale,
            color: AqColors.brandPrimary,
          ),
        ),
        const SizedBox(width: 8),
        Image.asset(
          'icons/aqoneLogo3.png',
          height: 30 * scale,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Text(
            'AqOne',
            style: TextStyle(
              fontSize: 34 * scale,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.5,
              color: palette.primaryText,
            ),
          ),
        ),
      ],
    );
  }
}
