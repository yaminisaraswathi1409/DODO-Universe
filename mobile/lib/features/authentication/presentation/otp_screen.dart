import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/errors/error_message.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../core/widgets/state_widgets.dart';
import '../application/auth_controller.dart';
import 'auth_scaffold.dart';

/// Navigation argument for the OTP screen.
class OtpArgs {
  const OtpArgs({required this.phone});
  final String phone;
}

/// Verifies the OTP. On success the auth controller enters the session and the
/// router redirects to the correct workspace.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key, required this.args});

  final OtpArgs args;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _formKey = GlobalKey<FormState>();
  final _codeController = TextEditingController();
  bool _loading = false;
  bool _resending = false;
  String? _error;
  String? _info;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (_loading || _resending) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _loading = true;
      _error = null;
      _info = null;
    });
    try {
      final session = await ref.read(authRepositoryProvider).verifyOtp(
            phone: widget.args.phone,
            otpCode: _codeController.text.trim(),
          );
      await ref.read(authControllerProvider.notifier).completeLogin(session);
    } catch (e) {
      if (mounted) setState(() => _error = describeError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resend() async {
    if (_loading || _resending) return;
    setState(() {
      _resending = true;
      _error = null;
      _info = null;
    });
    try {
      await ref.read(authRepositoryProvider).requestOtp(widget.args.phone);
      if (mounted) {
        _codeController.clear();
        setState(() => _info = 'A new code has been sent. Check your backend terminal for the latest code.');
      }
    } catch (e) {
      if (mounted) setState(() => _error = describeError(e));
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      title: 'Enter code',
      subtitle: 'We sent a 6-digit code to ${widget.args.phone}.',
      showBack: true,
      children: [
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppTextField(
                controller: _codeController,
                label: '6-digit code',
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.oneTimeCode],
                maxLength: 6,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                prefixIcon: const Icon(Icons.lock_outline),
                validator: (v) => (v == null || v.trim().length != 6)
                    ? 'Enter the 6-digit code'
                    : null,
                onSubmitted: (_) => (_loading || _resending) ? null : _verify(),
              ),
              if (_error != null) ...[
                const SizedBox(height: Spacing.md),
                InlineError(message: _error!),
              ],
              if (_info != null) ...[
                const SizedBox(height: Spacing.md),
                Text(_info!, textAlign: TextAlign.center),
              ],
              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Verify and continue',
                isLoading: _loading,
                onPressed: _verify,
              ),
            ],
          ),
        ),
        const SizedBox(height: Spacing.md),
        TextButton(
          onPressed: (_loading || _resending) ? null : _resend,
          child: Text(_resending ? 'Sending...' : 'Resend code'),
        ),
      ],
    );
  }
}

