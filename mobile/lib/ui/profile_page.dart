import 'package:flutter/material.dart';

import '../core/tokens.dart';
import '../core/validators.dart';
import '../data/identity_store.dart';
import '../models/license_type.dart';
import '../models/trust_tier.dart';
import 'info_page.dart';

const Color _brandPrimary = Color(0xFF0F69C9);
const Color _authText = Color(0xFF2C4960);
const Color _authLabel = Color(0xFF4A6B82);
const Color _authHint = Color(0xFF7A97AC);
const Color _authFill = Color(0xFFCFE8F9);
const Color _noticeBg = Color(0xFFFFF4E0);
const Color _noticeFg = Color(0xFF8A5A12);
const Color _dangerRed = Color(0xFFE74C3C);

class ProfilePage extends StatefulWidget {
  const ProfilePage({
    super.key,
    required this.identityStore,
    required this.identity,
    required this.themeMode,
    this.onThemeModeChanged,
    required this.onLogout,
    required this.onIdentityUpdated,
    this.onOpenHome,
  });

  final IdentityStore identityStore;
  final VesselIdentity identity;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode>? onThemeModeChanged;
  final VoidCallback onLogout;
  final ValueChanged<VesselIdentity> onIdentityUpdated;
  final VoidCallback? onOpenHome;

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  bool _editing = false;
  bool _saving = false;

  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  late TextEditingController _name;
  late TextEditingController _boat;
  late TextEditingController _license;
  late TextEditingController _phone;
  late LicenseType _licenseType;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.identity.skipperName);
    _boat = TextEditingController(text: widget.identity.boat);
    _license = TextEditingController(text: widget.identity.licenseNumber);
    _phone = TextEditingController(text: widget.identity.phone);
    _licenseType = widget.identity.licenseType;
  }

  @override
  void dispose() {
    _name.dispose();
    _boat.dispose();
    _license.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _startEditing() {
    setState(() {
      _editing = true;
      _name.text = widget.identity.skipperName;
      _boat.text = widget.identity.boat;
      _license.text = widget.identity.licenseNumber;
      _phone.text = widget.identity.phone;
      _licenseType = widget.identity.licenseType;
    });
  }

  void _cancelEditing() {
    setState(() => _editing = false);
  }

  Future<void> _save() async {
    if (_saving || !_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final updated = await widget.identityStore.ensure(
        boat: _boat.text,
        skipperName: _name.text,
        licenseType: _licenseType,
        licenseNumber: _license.text,
        phone: _phone.text,
      );
      if (!mounted) return;
      widget.onIdentityUpdated(updated);
      setState(() => _editing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Profile updated'),
          duration: Duration(seconds: 2),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _saving = false);
    }
  }

  void _confirmLogout() {
    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Log out'),
        content: const Text(
          'You will need to register again to use AqOne. '
          'Your SOS history on this device will be kept.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              widget.onLogout();
            },
            style: TextButton.styleFrom(foregroundColor: _dangerRed),
            child: const Text('Log out'),
          ),
        ],
      ),
    );
  }

  void _openInfo(String title, String body) {
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => InfoPage(title: title, body: body),
      ),
    );
  }

  void _handleBack() {
    if (_editing) {
      _cancelEditing();
      return;
    }
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    } else if (widget.onOpenHome != null) {
      widget.onOpenHome!();
    } else if (Navigator.of(context, rootNavigator: true).canPop()) {
      Navigator.of(context, rootNavigator: true).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    final identity = widget.identity;

    return PopScope(
      canPop: !_editing && Navigator.of(context).canPop(),
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        _handleBack();
      },
      child: Scaffold(
        backgroundColor: palette.canvas,
        appBar: AppBar(
          backgroundColor: palette.surface,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: _handleBack,
          ),
          title: Text(
            'Profile',
            style: TextStyle(
              color: palette.primaryText,
              fontWeight: FontWeight.w700,
            ),
          ),
          actions: [
            if (!_editing)
              IconButton(
                icon: const Icon(Icons.edit_rounded, size: 20),
                onPressed: _startEditing,
                tooltip: 'Edit profile',
              ),
          ],
        ),
        body: ListView(
          padding: EdgeInsets.fromLTRB(
            AqSpace.screen,
            AqSpace.lg,
            AqSpace.screen,
            AqSpace.xl + 100, // Added extra bottom padding to prevent bottom navigation bar overlap
          ),
          children: <Widget>[
            Center(
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: <Color>[Color(0xFF38BDF8), _brandPrimary],
                  ),
                  boxShadow: <BoxShadow>[
                    BoxShadow(
                      color: _brandPrimary.withValues(alpha: 0.35),
                      blurRadius: 14,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: ClipOval(
                  child: Image.asset(
                    'icons/emptyProfile.png',
                    height: 88,
                    width: 88,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      height: 88,
                      width: 88,
                      color: palette.surface,
                      child: const Icon(
                        Icons.person,
                        size: 44,
                        color: _brandPrimary,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: AqSpace.md),
            Center(
              child: Text(
                identity.skipperName.isNotEmpty
                    ? identity.skipperName
                    : 'No name set',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: palette.primaryText,
                ),
              ),
            ),
            const SizedBox(height: AqSpace.xs),
            Center(
              child: Text(
                identity.boat,
                style: TextStyle(
                  fontSize: 14,
                  color: palette.secondaryText,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: AqSpace.xs),
            Center(child: _TierChip(tier: identity.trustTier)),
            const SizedBox(height: AqSpace.lg),
            if (_editing)
              _buildEditForm(palette)
            else
              _buildInfoSection(palette, identity),
            const SizedBox(height: AqSpace.lg),
            Row(
              children: <Widget>[
                Container(
                  width: 4,
                  height: 18,
                  decoration: BoxDecoration(
                    color: _brandPrimary,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  'Settings',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: palette.primaryText,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AqSpace.sm),
            _ThemeSwitchTile(
              dark: Theme.of(context).brightness == Brightness.dark,
              onChanged: (dark) => widget.onThemeModeChanged?.call(
                dark ? ThemeMode.dark : ThemeMode.light,
              ),
            ),
            _SettingsTile(
              icon: Icons.info_outline_rounded,
              label: 'About AqOne',
              onTap: () => _openInfo('About AqOne', InfoCopy.about),
            ),
            _SettingsTile(
              icon: Icons.help_outline_rounded,
              label: 'Help & Support',
              onTap: () => _openInfo('Help & Support', InfoCopy.help),
            ),
            _SettingsTile(
              icon: Icons.shield_outlined,
              label: 'Privacy Policy',
              onTap: () => _openInfo('Privacy Policy', InfoCopy.privacy),
            ),
            _SettingsTile(
              icon: Icons.gavel_rounded,
              label: 'Terms of Use',
              onTap: () => _openInfo('Terms of Use', InfoCopy.terms),
            ),
            const SizedBox(height: AqSpace.lg),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _confirmLogout,
                icon: const Icon(Icons.logout_rounded, size: 18),
                label: const Text('Log out'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: _dangerRed,
                  side: const BorderSide(color: _dangerRed),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AqRadius.button),
                  ),
                ),
              ),
            ),
            const SizedBox(height: AqSpace.xl),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoSection(AqPalette palette, VesselIdentity identity) {
    return Container(
      padding: const EdgeInsets.all(AqSpace.base),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AqRadius.card),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _InfoRow(
            label: 'Full name',
            value: identity.skipperName.isNotEmpty ? identity.skipperName : '—',
          ),
          const SizedBox(height: AqSpace.md),
          _InfoRow(label: 'Boat name', value: identity.boat),
          const SizedBox(height: AqSpace.md),
          _InfoRow(
            label: 'Registration type',
            value: identity.licenseType.label,
          ),
          if (identity.hasLicense) ...<Widget>[
            const SizedBox(height: AqSpace.md),
            _InfoRow(
              label: '${identity.licenseType.label} number',
              value: identity.licenseNumber,
            ),
          ],
          const SizedBox(height: AqSpace.md),
          _InfoRow(
            label: 'Mobile number',
            value: identity.phone.isNotEmpty ? identity.phone : '—',
          ),
          const SizedBox(height: AqSpace.md),
          _InfoRow(label: 'Vessel ID', value: identity.vesselId),
        ],
      ),
    );
  }

  Widget _buildEditForm(AqPalette palette) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Container(
            padding: const EdgeInsets.all(AqSpace.base),
            decoration: BoxDecoration(
              color: palette.surface,
              borderRadius: BorderRadius.circular(AqRadius.card),
              border: Border.all(color: palette.border),
            ),
            child: Column(
              children: <Widget>[
                TextFormField(
                  controller: _name,
                  maxLength: 64,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  style: const TextStyle(color: _authText, fontSize: 15),
                  decoration: _decoration('Full name', Icons.person_outline_rounded),
                  validator: Validators.skipperName,
                ),
                const SizedBox(height: AqSpace.sm),
                TextFormField(
                  controller: _boat,
                  maxLength: 32,
                  textCapitalization: TextCapitalization.characters,
                  textInputAction: TextInputAction.next,
                  style: const TextStyle(color: _authText, fontSize: 15),
                  decoration: _decoration(
                    'Boat name or registration',
                    Icons.sailing_outlined,
                  ),
                  validator: Validators.boatName,
                ),
                const SizedBox(height: AqSpace.sm),
                DropdownButtonFormField<LicenseType>(
                  value: _licenseType,
                  isExpanded: true,
                  style: const TextStyle(color: _authText, fontSize: 15),
                  decoration: _decoration('Registration type', Icons.badge_outlined),
                  items: <DropdownMenuItem<LicenseType>>[
                    for (final type in LicenseType.values)
                      DropdownMenuItem<LicenseType>(
                        value: type,
                        child: Text(type.label, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: _saving
                      ? null
                      : (value) {
                          if (value == null) return;
                          setState(() {
                            _licenseType = value;
                            if (!value.requiresNumber) _license.clear();
                          });
                        },
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 4, left: 4),
                  child: Text(
                    _licenseType.hint,
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: _authLabel,
                      height: 1.3,
                    ),
                  ),
                ),
                if (_licenseType.requiresNumber) ...<Widget>[
                  const SizedBox(height: AqSpace.sm),
                  TextFormField(
                    controller: _license,
                    maxLength: 24,
                    textCapitalization: TextCapitalization.characters,
                    textInputAction: TextInputAction.next,
                    keyboardType: _licenseType == LicenseType.fishr
                        ? TextInputType.number
                        : TextInputType.text,
                    style: const TextStyle(color: _authText, fontSize: 15),
                    decoration: _decoration(
                      '${_licenseType.label} number',
                      Icons.confirmation_number_outlined,
                    ),
                    validator: (value) => Validators.license(value, _licenseType),
                  ),
                ],
                const SizedBox(height: AqSpace.sm),
                TextFormField(
                  controller: _phone,
                  maxLength: 20,
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.done,
                  style: const TextStyle(color: _authText, fontSize: 15),
                  decoration: _decoration('Mobile number', Icons.phone_iphone_rounded),
                  validator: Validators.phone,
                ),
              ],
            ),
          ),
          const SizedBox(height: AqSpace.md),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: _noticeBg,
              borderRadius: BorderRadius.circular(AqRadius.small),
              border: Border.all(color: _noticeFg.withValues(alpha: 0.25)),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Icon(Icons.privacy_tip_outlined, size: 18, color: _noticeFg),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Editing your details resets your trust tier to self-declared. '
                    'A responder will need to re-confirm your identity.',
                    style: TextStyle(
                      fontSize: 11.5,
                      color: _noticeFg,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AqSpace.md),
          Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton(
                  onPressed: _saving ? null : _cancelEditing,
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AqRadius.button),
                    ),
                  ),
                  child: const Text('Cancel'),
                ),
              ),
              const SizedBox(width: AqSpace.md),
              Expanded(
                child: ElevatedButton(
                  onPressed: _saving ? null : _save,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _brandPrimary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AqRadius.button),
                    ),
                  ),
                  child: _saving
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Text(
                          'Save changes',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  InputDecoration _decoration(String hint, IconData icon) {
    return InputDecoration(
      hintText: hint,
      counterText: '',
      hintStyle: const TextStyle(color: _authHint, fontSize: 14),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      filled: true,
      fillColor: _authFill.withValues(alpha: 0.55),
      prefixIcon: Icon(icon, color: _authLabel, size: 20),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.6)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: _brandPrimary, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Colors.redAccent),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Colors.redAccent, width: 1.5),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: palette.dimText,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: palette.primaryText,
          ),
        ),
      ],
    );
  }
}

class _TierChip extends StatelessWidget {
  const _TierChip({required this.tier});

  final TrustTier tier;

  @override
  Widget build(BuildContext context) {
    final confirmed = tier == TrustTier.confirmedByResponder;
    final color = confirmed ? const Color(0xFF1B7F4B) : _authLabel;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.75),
        borderRadius: BorderRadius.circular(AqRadius.pill),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(
            confirmed ? Icons.verified_rounded : Icons.edit_note_rounded,
            size: 14,
            color: color,
          ),
          const SizedBox(width: 4),
          Text(
            tier.label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _ThemeSwitchTile extends StatelessWidget {
  const _ThemeSwitchTile({required this.dark, required this.onChanged});

  final bool dark;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AqSpace.xs),
      child: Material(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AqRadius.standard),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Row(
            children: <Widget>[
              Icon(
                dark ? Icons.dark_mode_rounded : Icons.light_mode_rounded,
                size: 20,
                color: palette.secondaryText,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Dark mode',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: palette.primaryText,
                  ),
                ),
              ),
              Switch(
                value: dark,
                onChanged: onChanged,
                activeTrackColor: palette.active,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AqSpace.xs),
      child: Material(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AqRadius.standard),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AqRadius.standard),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: <Widget>[
                Icon(icon, size: 20, color: palette.secondaryText),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: palette.primaryText,
                    ),
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 20,
                  color: palette.dimText,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}