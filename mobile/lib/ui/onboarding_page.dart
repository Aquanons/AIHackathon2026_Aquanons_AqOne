import 'package:flutter/material.dart';

import '../data/identity_store.dart';
import 'info_page.dart';

const Color _brandDeep = Color(0xFF0958A6);
const Color _brandPrimary = Color(0xFF0F69C9);
const Color _authText = Color(0xFF2C4960);
const Color _authLabel = Color(0xFF4A6B82);
const Color _authHint = Color(0xFF7A97AC);
const Color _authFill = Color(0xFFCFE8F9);

class OnboardingPage extends StatefulWidget {
  const OnboardingPage({
    super.key,
    required this.identity,
    required this.onReady,
  });

  final IdentityStore identity;
  final VoidCallback onReady;

  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends State<OnboardingPage> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _boat = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _boat.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_saving) {
      return;
    }
    if (!_formKey.currentState!.validate()) {
      return;
    }
    setState(() => _saving = true);
    await widget.identity.ensure(boat: _boat.text.trim());
    if (!mounted) {
      return;
    }
    widget.onReady();
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
                        const SizedBox(height: 28),
                        const Text(
                          'Set up your boat',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.bold,
                            color: _brandDeep,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'No account, no password. Your boat name is what the '
                          'MDRRMO sees if you send an SOS.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 13,
                            color: _authLabel,
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 20),
                        TextFormField(
                          controller: _boat,
                          maxLength: 32,
                          textCapitalization: TextCapitalization.characters,
                          textInputAction: TextInputAction.done,
                          onFieldSubmitted: (_) => _submit(),
                          style: const TextStyle(
                            color: _authText,
                            fontSize: 15,
                          ),
                          decoration: _decoration(
                            'Boat name or registration',
                            const Icon(
                              Icons.sailing_outlined,
                              color: _authLabel,
                              size: 20,
                            ),
                          ),
                          validator: (value) =>
                              value == null || value.trim().isEmpty
                                  ? 'Please enter your boat name'
                                  : null,
                        ),
                        const SizedBox(height: 20),
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
                        const SizedBox(height: 28),
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
                        const SizedBox(height: 20),
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

  InputDecoration _decoration(String hint, Widget prefixIcon) {
    return InputDecoration(
      hintText: hint,
      counterText: '',
      hintStyle: const TextStyle(color: _authHint, fontSize: 14),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 14,
      ),
      filled: true,
      fillColor: _authFill.withOpacity(0.55),
      prefixIcon: prefixIcon,
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(
          color: Colors.white.withOpacity(0.6),
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
          height: isWide ? 140 : mediaQuery.size.height * 0.15,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Icon(
            Icons.waves_rounded,
            size: isWide ? 110 : mediaQuery.size.height * 0.12,
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
