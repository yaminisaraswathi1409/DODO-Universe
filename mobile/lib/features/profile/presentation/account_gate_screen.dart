import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/widgets/app_button.dart';
import '../../authentication/application/auth_controller.dart';

/// Blocking screen for accounts the backend reports as suspended/deactivated or
/// that have not finished onboarding.
class AccountGateScreen extends ConsumerWidget {
  const AccountGateScreen.suspended({super.key})
      : _suspended = true;

  const AccountGateScreen.incompleteOnboarding({super.key})
      : _suspended = false;

  final bool _suspended;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final auth = ref.watch(authControllerProvider);
    final user = auth is Authenticated ? auth.user : null;

    final title = _suspended ? 'Account suspended' : 'Finish setting up your account';
    final icon = _suspended ? Icons.block : Icons.pending_actions_outlined;
    final String message;
    if (_suspended) {
      final reason = user?.suspensionReason;
      message = 'Your account has been suspended or deactivated by platform '
          'administration.${reason != null && reason.isNotEmpty ? ' Reason: $reason' : ''} '
          'Please contact support.';
    } else {
      message = 'Your account status is "${user?.status ?? 'unknown'}". '
          'Complete profile details and face verification to activate your account.';
    }

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Spacing.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Icon(icon, size: 64, color: theme.colorScheme.primary),
                  const SizedBox(height: Spacing.md),
                  Text(
                    title,
                    style: theme.textTheme.headlineSmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: Spacing.md),
                  Text(
                    message,
                    style: theme.textTheme.bodyMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: Spacing.lg),
                  if (!_suspended) ...[
                    AppButton(
                      label: user?.status == 'PROFILE_COMPLETED'
                          ? 'Continue to Face ID'
                          : 'Complete Profile Details',
                      icon: Icons.arrow_forward,
                      onPressed: () {
                        if (user?.status == 'PROFILE_COMPLETED') {
                          context.go('/verify-face');
                        } else {
                          context.go('/complete-profile');
                        }
                      },
                    ),
                    const SizedBox(height: Spacing.sm),
                  ],
                  AppButton(
                    label: 'Sign out',
                    isSecondary: true,
                    icon: Icons.logout,
                    onPressed: () =>
                        ref.read(authControllerProvider.notifier).logout(),
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

