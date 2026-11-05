import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/widgets/app_card.dart';
import '../../authentication/application/auth_controller.dart';

/// Profile section: read-only account information returned by the backend.
/// Editing and uploads arrive in a later phase.
class ProfileSection extends ConsumerWidget {
  const ProfileSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (auth is! Authenticated) return const SizedBox.shrink();
    final user = auth.user;
    final theme = Theme.of(context);

    Widget row(String label, String? value) => Padding(
          padding: const EdgeInsets.symmetric(vertical: Spacing.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 120,
                child: Text(
                  label,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
              Expanded(
                child: Text(
                  (value == null || value.isEmpty) ? '-' : value,
                  style: theme.textTheme.bodyLarge,
                ),
              ),
            ],
          ),
        );

    return ListView(
      padding: const EdgeInsets.all(Spacing.md),
      children: [
        AppCard(
          child: Column(
            children: [
              row('Name', user.fullName),
              row('Mobile', user.phone),
              row('Email', user.email),
              row('Account status', user.status),
              row('Account role', user.role),
            ],
          ),
        ),
      ],
    );
  }
}
