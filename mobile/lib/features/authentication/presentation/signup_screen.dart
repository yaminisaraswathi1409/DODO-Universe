import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/errors/error_message.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../core/widgets/state_widgets.dart';
import '../application/auth_controller.dart';
import '../domain/phone_input.dart';
import 'auth_scaffold.dart';
import 'otp_screen.dart';

/// Account creation with the fields supported by `POST /auth/signup`:
/// full name, phone and optional email. A verification OTP follows.
class SignupScreen extends ConsumerStatefulWidget {
  const SignupScreen({super.key});

  @override
  ConsumerState<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends ConsumerState<SignupScreen> {
  static final _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_loading) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final phone = PhoneInput.normalize(_phoneController.text);
    try {
      await ref.read(authRepositoryProvider).signup(
            fullName: _nameController.text.trim(),
            phone: phone,
            email: _emailController.text.trim(),
          );
      if (!mounted) return;
      context.push('/verify-otp', extra: OtpArgs(phone: phone));
    } catch (e) {
      if (mounted) setState(() => _error = describeError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      title: 'Create account',
      subtitle: 'Register with your mobile number. You will verify it with an OTP.',
      showBack: true,
      children: [
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppTextField(
                controller: _nameController,
                label: 'Full name',
                keyboardType: TextInputType.name,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.name],
                prefixIcon: const Icon(Icons.person_outline),
                validator: (v) => (v == null || v.trim().length < 2)
                    ? 'Enter your full name'
                    : null,
              ),
              const SizedBox(height: Spacing.md),
              AppTextField(
                controller: _phoneController,
                label: 'Mobile number',
                hint: '10-digit number or +country code',
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.telephoneNumber],
                prefixIcon: const Icon(Icons.phone_outlined),
                validator: PhoneInput.validate,
              ),
              const SizedBox(height: Spacing.md),
              AppTextField(
                controller: _emailController,
                label: 'Email (optional)',
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.email],
                prefixIcon: const Icon(Icons.mail_outline),
                validator: (v) {
                  final value = v?.trim() ?? '';
                  if (value.isEmpty) return null;
                  return _emailPattern.hasMatch(value)
                      ? null
                      : 'Enter a valid email address';
                },
                onSubmitted: (_) => _submit(),
              ),
              if (_error != null) ...[
                const SizedBox(height: Spacing.md),
                InlineError(message: _error!),
              ],
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Create account',
                isLoading: _loading,
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

