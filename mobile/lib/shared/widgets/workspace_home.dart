import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/app_theme.dart';
import '../../core/widgets/app_card.dart';
import '../../features/authentication/application/auth_controller.dart';
import '../../shared/models/workspace.dart';

/// Home section shared by all four workspaces. Phase 1 shows only information
/// that is already available from authentication (no business data).
class WorkspaceHome extends ConsumerWidget {
  const WorkspaceHome({super.key, required this.workspace});

  final Workspace workspace;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final auth = ref.watch(authControllerProvider);
    if (auth is! Authenticated) return const SizedBox.shrink();

    final user = auth.user;
    final others =
        workspace.sections.where((s) => !s.isHome && s.key != 'profile');

    return ListView(
      padding: const EdgeInsets.all(Spacing.md),
      children: [
        AppCard(
          child: Row(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: theme.colorScheme.primaryContainer,
                child: Icon(workspace.icon, color: theme.colorScheme.onPrimaryContainer),
              ),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${workspace.label} dashboard',
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    Text(
                      user.fullName.isEmpty ? 'Welcome' : 'Hello, ${user.fullName}',
                      style: theme.textTheme.titleLarge,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (!auth.capabilitiesVerified) ...[
          const SizedBox(height: Spacing.md),
          AppCard(
            child: Row(
              children: [
                Icon(Icons.info_outline, color: theme.colorScheme.tertiary),
                const SizedBox(width: Spacing.sm),
                const Expanded(
                  child: Text(
                    'Could not load your vendor/driver services. Showing the '
                    'customer view only. Sign in again to retry.',
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: Spacing.lg),
        Text('Sections', style: theme.textTheme.titleMedium),
        const SizedBox(height: Spacing.sm),
        for (final section in others) ...[
          AppCard(
            child: Row(
              children: [
                Icon(section.icon),
                const SizedBox(width: Spacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(section.label, style: theme.textTheme.titleSmall),
                      Text(
                        section.description,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  'Coming soon',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.outline,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: Spacing.sm),
        ],
      ],
    );
  }
}

