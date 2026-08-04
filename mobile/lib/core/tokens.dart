import 'package:flutter/material.dart';

class AqColors {
  const AqColors._();

  static const Color brandDeep = Color(0xFF0958A6);
  static const Color brandPrimary = Color(0xFF0F69C9);
  static const Color skyAccent = Color(0xFF38BDF8);

  static const Color appNavy = Color(0xFF0F172A);
  static const Color slateSurface = Color(0xFF1E293B);
  static const Color raisedSlate = Color(0xFF334155);
  static const Color slateText = Color(0xFF64748B);
  static const Color mutedSlate = Color(0xFF94A3B8);
  static const Color paleSlate = Color(0xFFCBD5E1);
  static const Color lightBorder = Color(0xFFCFE8F9);
  static const Color lightBlueSurface = Color(0xFFE8F8FF);
  static const Color lightCanvas = Color(0xFFF4F8FA);
  static const Color darkPrimaryText = Color(0xFFF0F4F8);

  static const Color success = Color(0xFF2ECC71);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFE74C3C);
  static const Color info = Color(0xFF2E86AB);
  static const Color connectivity = Color(0xFF22D3EE);
  static const Color disabled = Color(0xFF94A3B8);
}

class AqRadius {
  const AqRadius._();

  static const double compact = 6;
  static const double small = 8;
  static const double button = 10;
  static const double standard = 12;
  static const double card = 16;
  static const double large = 20;
  static const double pill = 999;
}

class AqSpace {
  const AqSpace._();

  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double base = 16;
  static const double lg = 20;
  static const double screen = 24;
  static const double xl = 32;
}

class AqPalette {
  const AqPalette({
    required this.canvas,
    required this.surface,
    required this.surfaceAlt,
    required this.primaryText,
    required this.secondaryText,
    required this.dimText,
    required this.border,
    required this.active,
  });

  final Color canvas;
  final Color surface;
  final Color surfaceAlt;
  final Color primaryText;
  final Color secondaryText;
  final Color dimText;
  final Color border;
  final Color active;

  static AqPalette of(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return isDark ? dark : light;
  }

  static const AqPalette light = AqPalette(
    canvas: AqColors.lightCanvas,
    surface: Colors.white,
    surfaceAlt: AqColors.lightBlueSurface,
    primaryText: AqColors.slateSurface,
    secondaryText: AqColors.slateText,
    dimText: AqColors.mutedSlate,
    border: AqColors.lightBorder,
    active: AqColors.brandPrimary,
  );

  static const AqPalette dark = AqPalette(
    canvas: AqColors.appNavy,
    surface: AqColors.slateSurface,
    surfaceAlt: AqColors.raisedSlate,
    primaryText: AqColors.darkPrimaryText,
    secondaryText: AqColors.mutedSlate,
    dimText: AqColors.slateText,
    border: Color(0x1AFFFFFF),
    active: AqColors.skyAccent,
  );
}

ThemeData buildAqTheme(Brightness brightness) {
  final palette =
      brightness == Brightness.dark ? AqPalette.dark : AqPalette.light;
  final colorScheme = ColorScheme.fromSeed(
    seedColor: AqColors.brandPrimary,
    brightness: brightness,
  ).copyWith(surface: palette.surface);
  final isDark = brightness == Brightness.dark;

  const inputShape = OutlineInputBorder(
    borderRadius: BorderRadius.all(Radius.circular(AqRadius.standard)),
  );

  return ThemeData(
    brightness: brightness,
    scaffoldBackgroundColor: palette.canvas,
    colorScheme: colorScheme,
    useMaterial3: true,
    splashFactory: InkRipple.splashFactory,
    appBarTheme: AppBarTheme(
      backgroundColor: palette.surface,
      foregroundColor: palette.primaryText,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w800,
        color: palette.primaryText,
      ),
    ),
    cardTheme: CardThemeData(
      color: palette.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AqRadius.card),
        side: BorderSide(color: palette.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: palette.surfaceAlt.withValues(alpha: isDark ? 0.3 : 0.55),
      hintStyle: TextStyle(fontSize: 14, color: palette.dimText),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 14,
      ),
      border:
          inputShape.copyWith(borderSide: BorderSide(color: palette.border)),
      enabledBorder:
          inputShape.copyWith(borderSide: BorderSide(color: palette.border)),
      focusedBorder: inputShape.copyWith(
          borderSide: BorderSide(color: palette.active, width: 1.6)),
      errorBorder: inputShape.copyWith(
          borderSide: const BorderSide(color: AqColors.danger)),
      focusedErrorBorder: inputShape.copyWith(
        borderSide: const BorderSide(color: AqColors.danger, width: 1.6),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: isDark ? AqColors.raisedSlate : AqColors.appNavy,
      contentTextStyle: const TextStyle(fontSize: 14, color: Colors.white),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AqRadius.standard),
      ),
      elevation: 6,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: palette.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
      ),
    ),
    dividerTheme: DividerThemeData(
      color: palette.border,
      thickness: 1,
      space: 1,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AqColors.brandPrimary,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(vertical: 15, horizontal: 20),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AqRadius.button + 2),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: palette.active,
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: palette.active,
        side: BorderSide(color: palette.active),
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AqRadius.button + 2),
        ),
      ),
    ),
  );
}
