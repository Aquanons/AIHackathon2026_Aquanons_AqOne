import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';

import '../../core/l10n_fallback.dart';
import '../../core/locale_controller.dart';
import '../../core/tokens.dart';

/// Every supported language labelled in its own language.
///
/// Deliberately not routed through [AppLocalizations]: a picker that renames
/// the options as you change language is unusable for the exact person who
/// needs it - someone who opened an app in a language they cannot read and is
/// looking for the name they recognise. "Akeanon" must say "Akeanon"
/// regardless of what the app is currently set to.
const Map<String, String> kLanguageNames = <String, String>{
  'en': 'English',
  'fil': 'Tagalog',
  'akl': 'Akeanon',
};

String languageNameFor(Locale locale) =>
    kLanguageNames[locale.languageCode] ?? locale.languageCode;

/// Compact segmented control. Used in onboarding, where the user has not
/// chosen a language yet and the options need to be visible without a tap.
class LanguageSegmentedPicker extends StatelessWidget {
  const LanguageSegmentedPicker({super.key, required this.controller});

  final LocaleController controller;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    final Locale active = controller.effectiveLocale(context);

    return Container(
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AqRadius.card),
        border: Border.all(color: palette.border),
      ),
      padding: const EdgeInsets.all(4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: kSupportedLocales.map((Locale locale) {
          final bool selected = locale.languageCode == active.languageCode;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: Material(
              color: selected ? palette.active : Colors.transparent,
              borderRadius: BorderRadius.circular(AqRadius.card - 4),
              child: InkWell(
                borderRadius: BorderRadius.circular(AqRadius.card - 4),
                onTap: () => controller.setLocale(locale),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AqSpace.base,
                    vertical: AqSpace.sm,
                  ),
                  child: Text(
                    languageNameFor(locale),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      color: selected ? Colors.white : palette.secondaryText,
                    ),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

/// Settings-row form of the picker, for the Profile page. Opens a sheet
/// rather than cycling in place, so the user can see all options before
/// committing - important when one of the options is a language they cannot
/// read.
class LanguageSettingTile extends StatelessWidget {
  const LanguageSettingTile({super.key, required this.controller});

  final LocaleController controller;

  Future<void> _open(BuildContext context) async {
    final Locale active = controller.effectiveLocale(context);
    final palette = AqPalette.of(context);

    final Locale? picked = await showModalBottomSheet<Locale>(
      context: context,
      backgroundColor: palette.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AqRadius.card)),
      ),
      builder: (BuildContext sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const SizedBox(height: AqSpace.md),
              Text(
                AppLocalizations.of(sheetContext).languagePickerPrompt,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: palette.primaryText,
                ),
              ),
              const SizedBox(height: AqSpace.sm),
              ...kSupportedLocales.map(
                (Locale locale) => ListTile(
                  title: Text(
                    languageNameFor(locale),
                    style: TextStyle(color: palette.primaryText),
                  ),
                  trailing: locale.languageCode == active.languageCode
                      ? Icon(Icons.check_rounded, color: palette.active)
                      : null,
                  onTap: () => Navigator.pop(sheetContext, locale),
                ),
              ),
              const SizedBox(height: AqSpace.sm),
            ],
          ),
        );
      },
    );

    if (picked != null) {
      await controller.setLocale(picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    final t = AppLocalizations.of(context);

    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(Icons.translate_rounded, color: palette.active),
      title: Text(
        t.languageSettingTitle,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: palette.primaryText,
        ),
      ),
      subtitle: Text(
        t.languageSettingSubtitle,
        style: TextStyle(fontSize: 12, color: palette.dimText),
      ),
      trailing: Text(
        languageNameFor(controller.effectiveLocale(context)),
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: palette.secondaryText,
        ),
      ),
      onTap: () => _open(context),
    );
  }
}
