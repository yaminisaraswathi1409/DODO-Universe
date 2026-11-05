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

/// Phone + OTP sign-in. The backend has no password login.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
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
      await ref.read(authRepositoryProvider).requestOtp(phone);
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
    final auth = ref.watch(authControllerProvider);
    final notice = auth is Unauthenticated ? auth.notice : null;

    return AuthScaffold(
      title: 'Sign in',
      subtitle: 'Enter your mobile number. We will send you a one-time code.',
      children: [
        if (notice != null) ...[
          InlineError(message: notice),
          const SizedBox(height: Spacing.md),
        ],
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppTextField(
                controller: _phoneController,
                label: 'Mobile number',
                hint: '10-digit number or +country code',
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.telephoneNumber],
                prefixIcon: const Icon(Icons.phone_outlined),
                validator: PhoneInput.validate,
                onSubmitted: (_) => _submit(),
              ),
              if (_error != null) ...[
                const SizedBox(height: Spacing.md),
                InlineError(message: _error!),
              ],
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Send OTP',
                isLoading: _loading,
                onPressed: _submit,
              ),
            ],
          ),
        ),
        const SizedBox(height: Spacing.md),
        TextButton(
          onPressed: _loading ? null : () => context.push('/signup'),
          child: const Text('New to DODO? Create an account'),
        ),
      ],
    );
  }
}

