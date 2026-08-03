import 'package:flutter/material.dart';

import '../core/validators.dart';
import '../data/identity_store.dart';
import '../models/license_type.dart';
import '../models/trust_tier.dart';
import 'info_page.dart';

const Color _brandDeep = Color(0xFF0958A6);
const Color _brandPrimary = Color(0xFF0F69C9);
const Color _authText = Color(0xFF2C4960);
const Color _authLabel = Color(0xFF4A6B82);
const Color _authHint = Color(0xFF7A97AC);
const Color _authFill = Color(0xFFCFE8F9);
const Color _noticeBg = Color(0xFFFFF4E0);
const Color _noticeFg = Color(0xFF8A5A12);

/// Registration for a vessel.
///
/// This screen collects a claim, it does not verify one. There is no public
/// BFAR or LGU lookup to check a number against, and the app is built to work
/// with no internet, so the handset can only check that what was typed has a
/// plausible shape. The copy here says so plainly rather than implying a
/// check that never happens.
///
/// Nothing on this screen blocks the SOS button. The registration number is
/// optional by design - an unregistered fisherman in trouble still needs the
/// app to work.
class OnboardingPage extends StatefulWidget {
  const OnboardingPage({
    super.key,
    required this.identity,
    required this.onReady,
    this.initialIdentity,
  });

  final IdentityStore identity;
  final VoidCallback onReady;
  final VesselIdentity? initialIdentity;

  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends State<OnboardingPage> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final TextEditingController _boat = TextEditingController();
  final TextEditingController _license = TextEditingController();
  final TextEditingController _phone = TextEditingController();

  LicenseType _licenseType = LicenseType.none;
  bool _saving = false;
  String? _error;

  bool get _isReturning {
    final boat = widget.initialIdentity?.boat;
    return boat != null && boat.trim().isNotEmpty;
  }

  @override
  void initState() {
    super.initState();
    final existing = widget.initialIdentity;
    if (existing != null) {
      _name.text = existing.skipperName;
      _boat.text = existing.boat;
      _license.text = existing.licenseNumber;
      _phone.text = existing.phone;
      _licenseType = existing.licenseType;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _boat.dispose();
    _license.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_saving) {
      return;
    }
    if (!_formKey.currentState!.validate()) {
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.identity.ensure(
        boat: _boat.text,
        skipperName: _name.text,
        licenseType: _licenseType,
        licenseNumber: _license.text,
        phone: _phone.text,
      );
      if (!mounted) {
        return;
      }
      widget.onReady();
    } catch (_) {
      // Never strand the user on a dead button: a failed write has to leave
      // the form usable so they can try again.
      if (!mounted) {
        return;
      }
      setState(() {
        _saving = false;
        _error = 'Could not save your details. Please try again.';
      });
    }
  }

  void _openInfo(String title, String body) {
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => InfoPage(title: title, body: body),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final isWide = mediaQuery.size.width > 600;
    final tier = widget.initialIdentity?.trustTier;

    return Scaffold(
      body: Stack(
        children: <Widget>[
          Positioned.fill(
            child: Image.asset(
              'assets/images/background.png',
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: <Color>[
                      Color(0xFFE8F8FF),
                      Color(0xFFF4F8FA),
                      Color(0xFFCFE8F9),
                    ],
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 20,
                ),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        _Branding(isWide: isWide, mediaQuery: mediaQuery),
                        const SizedBox(height: 24),
                        Text(
                          _isReturning ? 'Welcome back' : 'Register your boat',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.bold,
                            color: _brandDeep,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _isReturning
                              ? 'Check your details are still correct. Update '
                                  'them here if anything has changed.'
                              : 'No password. These details travel with your '
                                  'SOS so the MDRRMO knows who to look for.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 13,
                            color: _authLabel,
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 18),
                        if (tier != null) ...<Widget>[
                          _TierChip(tier: tier),
                          const SizedBox(height: 14),
                        ],
                        TextFormField(
                          controller: _name,
                          maxLength: 64,
                          textCapitalization: TextCapitalization.words,
                          textInputAction: TextInputAction.next,
                          style: const TextStyle(
                            color: _authText,
                            fontSize: 15,
                          ),
                          decoration: _decoration(
                            'Full name',
                            Icons.person_outline_rounded,
                          ),
                          validator: Validators.skipperName,
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _boat,
                          maxLength: 32,
                          textCapitalization: TextCapitalization.characters,
                          textInputAction: TextInputAction.next,
                          style: const TextStyle(
                            color: _authText,
                            fontSize: 15,
                          ),
                          decoration: _decoration(
                            'Boat name or registration',
                            Icons.sailing_outlined,
                          ),
                          validator: Validators.boatName,
                        ),
                        const SizedBox(height: 14),
                        DropdownButtonFormField<LicenseType>(
                          value: _licenseType,
                          isExpanded: true,
                          style: const TextStyle(
                            color: _authText,
                            fontSize: 15,
                          ),
                          decoration: _decoration(
                            'Registration type',
                            Icons.badge_outlined,
                          ),
                          items: <DropdownMenuItem<LicenseType>>[
                            for (final type in LicenseType.values)
                              DropdownMenuItem<LicenseType>(
                                value: type,
                                child: Text(
                                  type.label,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                          onChanged: _saving
                              ? null
                              : (value) {
                                  if (value == null) {
                                    return;
                                  }
                                  setState(() {
                                    _licenseType = value;
                                    if (!value.requiresNumber) {
                                      _license.clear();
                                    }
                                  });
                                },
                        ),
                        Padding(
                          padding: const EdgeInsets.only(top: 6, left: 4),
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
                          const SizedBox(height: 14),
                          TextFormField(
                            controller: _license,
                            maxLength: 24,
                            textCapitalization: TextCapitalization.characters,
                            textInputAction: TextInputAction.next,
                            keyboardType: _licenseType == LicenseType.fishr
                                ? TextInputType.number
                                : TextInputType.text,
                            style: const TextStyle(
                              color: _authText,
                              fontSize: 15,
                            ),
                            decoration: _decoration(
                              '${_licenseType.label} number',
                              Icons.confirmation_number_outlined,
                            ),
                            validator: (value) =>
                                Validators.license(value, _licenseType),
                          ),
                        ],
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _phone,
                          maxLength: 20,
                          keyboardType: TextInputType.phone,
                          textInputAction: TextInputAction.done,
                          onFieldSubmitted: (_) => _submit(),
                          style: const TextStyle(
                            color: _authText,
                            fontSize: 15,
                          ),
                          decoration: _decoration(
                            'Mobile number',
                            Icons.phone_iphone_rounded,
                          ),
                          validator: Validators.phone,
                        ),
                        const SizedBox(height: 16),
                        const _UnverifiedNotice(),
                        if (_error != null) ...<Widget>[
                          const SizedBox(height: 12),
                          Text(
                            _error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 13,
                              color: Colors.redAccent,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                        const SizedBox(height: 18),
                        ElevatedButton(
                          onPressed: _saving ? null : _submit,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _brandPrimary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                            elevation: 2,
                            shadowColor: Colors.black26,
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
                                  'Continue',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                        ),
                        const SizedBox(height: 24),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: <Widget>[
                            Row(
                              children: <Widget>[
                                _FooterIcon(
                                  icon: Icons.help_outline_rounded,
                                  onTap: () => _openInfo(
                                    'Help & Support',
                                    InfoCopy.help,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                _FooterIcon(
                                  icon: Icons.info_outline_rounded,
                                  onTap: () => _openInfo(
                                    'About AqOne',
                                    InfoCopy.about,
                                  ),
                                ),
                              ],
                            ),
                            GestureDetector(
                              onTap: () => _openInfo(
                                'Safety Notice',
                                InfoCopy.terms,
                              ),
                              child: const Text(
                                'Safety notice',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: _brandPrimary,
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 18),
                        Column(
                          children: <Widget>[
                            const Text(
                              'By continuing you agree to the',
                              style: TextStyle(
                                fontSize: 12,
                                color: _authLabel,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Wrap(
                              alignment: WrapAlignment.center,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: <Widget>[
                                GestureDetector(
                                  onTap: () => _openInfo(
                                    'Privacy Policy',
                                    InfoCopy.privacy,
                                  ),
                                  child: const Text(
                                    'Privacy Policy',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: _brandPrimary,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                const Text(
                                  ' and ',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: _authLabel,
                                  ),
                                ),
                                GestureDetector(
                                  onTap: () => _openInfo(
                                    'Terms of Use',
                                    InfoCopy.terms,
                                  ),
                                  child: const Text(
                                    'Terms of Use',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: _brandPrimary,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
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
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 14,
      ),
      filled: true,
      fillColor: _authFill.withValues(alpha: 0.55),
      prefixIcon: Icon(icon, color: _authLabel, size: 20),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(
          color: Colors.white.withValues(alpha: 0.6),
        ),
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

/// Says out loud that nothing typed here is checked.
///
/// Deliberate: claiming "verified fishermen only" would be false, and the
/// first responder to trust that claim would be misled at exactly the wrong
/// moment.
class _UnverifiedNotice extends StatelessWidget {
  const _UnverifiedNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: _noticeBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _noticeFg.withValues(alpha: 0.25)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(Icons.privacy_tip_outlined, size: 18, color: _noticeFg),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'AqOne cannot check these details against BFAR or your LGU. '
              'They are recorded as your own declaration and shown to the '
              'MDRRMO with your SOS. Sending a false distress call is an '
              'offence.',
              style: TextStyle(
                fontSize: 11.5,
                color: _noticeFg,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Shows the current tier so the skipper knows where they stand.
class _TierChip extends StatelessWidget {
  const _TierChip({required this.tier});

  final TrustTier tier;

  @override
  Widget build(BuildContext context) {
    final confirmed = tier == TrustTier.confirmedByResponder;
    final color = confirmed ? const Color(0xFF1B7F4B) : _authLabel;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.75),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Icon(
            confirmed ? Icons.verified_rounded : Icons.edit_note_rounded,
            size: 16,
            color: color,
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              tier.label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Branding extends StatelessWidget {
  const _Branding({required this.isWide, required this.mediaQuery});

  final bool isWide;
  final MediaQueryData mediaQuery;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        Image.asset(
          'assets/icons/aqoneLogo2.png',
          height: isWide ? 120 : mediaQuery.size.height * 0.12,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Icon(
            Icons.waves_rounded,
            size: isWide ? 96 : mediaQuery.size.height * 0.10,
            color: _brandPrimary,
          ),
        ),
        const SizedBox(height: 10),
        Image.asset(
          'assets/icons/aqoneLogo3.png',
          height: isWide ? 45 : mediaQuery.size.height * 0.045,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => const Text(
            'AqOne',
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.bold,
              color: _brandDeep,
              letterSpacing: -0.5,
            ),
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Gabay sa Bawat Alon,\nKonektado sa Bawat Layon',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.bold,
            color: _brandDeep,
            height: 1.25,
          ),
        ),
      ],
    );
  }
}

class _FooterIcon extends StatelessWidget {
  const _FooterIcon({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 28,
        height: 28,
        decoration: const BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          boxShadow: <BoxShadow>[
            BoxShadow(
              color: Colors.black12,
              blurRadius: 4,
              offset: Offset(0, 2),
            ),
          ],
        ),
        child: Center(
          child: Icon(icon, size: 18, color: _brandPrimary),
        ),
      ),
    );
  }
}
