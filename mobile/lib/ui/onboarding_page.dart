import 'package:flutter/material.dart';

import '../core/tokens.dart';
import '../data/identity_store.dart';

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
  final TextEditingController _boat = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _boat.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _boat.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Enter your boat name or registration.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    await widget.identity.ensure(boat: name);
    if (!mounted) {
      return;
    }
    widget.onReady();
  }

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    return Scaffold(
      backgroundColor: palette.canvas,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(
              horizontal: AqSpace.screen,
              vertical: AqSpace.lg,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Text(
                    'AqOne',
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.5,
                      color: palette.active,
                    ),
                  ),
                  const SizedBox(height: AqSpace.sm),
                  Text(
                    'Send an SOS at sea without mobile signal.',
                    style: TextStyle(
                      fontSize: 16,
                      height: 1.5,
                      color: palette.secondaryText,
                    ),
                  ),
                  const SizedBox(height: AqSpace.xl),
                  Text(
                    'Boat name',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: palette.primaryText,
                    ),
                  ),
                  const SizedBox(height: AqSpace.sm),
                  TextField(
                    controller: _boat,
                    maxLength: 32,
                    textCapitalization: TextCapitalization.characters,
                    decoration: InputDecoration(
                      hintText: 'BG-123',
                      counterText: '',
                      filled: true,
                      fillColor: palette.surface,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(AqRadius.small),
                        borderSide: BorderSide(color: palette.border),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(AqRadius.small),
                        borderSide: BorderSide(color: palette.border),
                      ),
                    ),
                  ),
                  const SizedBox(height: AqSpace.sm),
                  Text(
                    'This name is what the MDRRMO responder sees. No account or '
                    'password is needed.',
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.5,
                      color: palette.dimText,
                    ),
                  ),
                  if (_error != null) ...<Widget>[
                    const SizedBox(height: AqSpace.md),
                    Text(
                      _error!,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AqColors.danger,
                      ),
                    ),
                  ],
                  const SizedBox(height: AqSpace.screen),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _saving ? null : _submit,
                      child: Text(_saving ? 'Saving…' : 'Continue'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
