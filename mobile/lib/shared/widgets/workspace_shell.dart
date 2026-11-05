import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme/app_theme.dart';
import '../../core/widgets/dodo_app_bar.dart';
import '../../features/authentication/application/auth_controller.dart';
import '../../features/profile/presentation/profile_section.dart';
import '../models/workspace.dart';
import 'section_placeholder.dart';
import 'workspace_home.dart';

/// Common chrome for the four role dashboards: app bar, navigation (drawer on
/// phones, rail on wide screens), workspace switching (only between workspaces
/// the backend data allows) and sign out.
class WorkspaceShell extends ConsumerWidget {
  const WorkspaceShell({
    super.key,
    required this.workspace,
    required this.sectionKey,
  });

  final Workspace workspace;
  final String sectionKey;

  static const double wideBreakpoint = 840;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (auth is! Authenticated) return const SizedBox.shrink();

    final section = workspace.sectionByKey(sectionKey) ?? workspace.sections.first;
    final selectedIndex = workspace.sections.indexOf(section);
    final switchable = auth.capabilities.workspaces;

    void goToIndex(int index) {
      context.go(workspace.pathFor(workspace.sections[index]));
    }

    Future<void> signOut() => ref.read(authControllerProvider.notifier).logout();

    final body = KeyedSubtree(
      key: ValueKey('${workspace.key}/${section.key}'),
      child: _bodyFor(section),
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final isWide = constraints.maxWidth >= wideBreakpoint;

        if (isWide) {
          return Scaffold(
            appBar: DodoAppBar(title: section.label),
            body: Row(
              children: [
                NavigationRail(
                  extended: true,
                  selectedIndex: selectedIndex,
                  onDestinationSelected: goToIndex,
                  destinations: [
                    for (final s in workspace.sections)
                      NavigationRailDestination(
                        icon: Icon(s.icon),
                        label: Text(s.label),
                      ),
                  ],
                  trailing: Padding(
                    padding: const EdgeInsets.all(Spacing.md),
                    child: TextButton.icon(
                      onPressed: signOut,
                      icon: const Icon(Icons.logout),
                      label: const Text('Sign out'),
                    ),
                  ),
                ),
                const VerticalDivider(width: 1),
                Expanded(child: body),
              ],
            ),
          );
        }

        return Scaffold(
          appBar: DodoAppBar(title: section.label),
          drawer: NavigationDrawer(
            selectedIndex: selectedIndex,
            onDestinationSelected: (index) {
              Navigator.of(context).pop();
              goToIndex(index);
            },
            children: [
              _DrawerHeader(workspace: workspace, name: auth.user.fullName),
              for (final s in workspace.sections)
                NavigationDrawerDestination(
                  icon: Icon(s.icon),
                  label: Text(s.label),
                ),
              if (switchable.length > 1) ...[
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: Spacing.md),
                  child: Divider(),
                ),
                for (final w in switchable.where((w) => w != workspace))
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Spacing.sm),
                    child: ListTile(
                      leading: Icon(w.icon),
                      title: Text('Switch to ${w.label}'),
                      onTap: () {
                        Navigator.of(context).pop();
                        context.go(w.homePath);
                      },
                    ),
                  ),
              ],
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: Spacing.md),
                child: Divider(),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Spacing.sm),
                child: ListTile(
                  leading: const Icon(Icons.logout),
                  title: const Text('Sign out'),
                  onTap: () {
                    Navigator.of(context).pop();
                    signOut();
                  },
                ),
              ),
            ],
          ),
          body: body,
        );
      },
    );
  }

  Widget _bodyFor(WorkspaceSection section) {
    if (section.isHome) return WorkspaceHome(workspace: workspace);
    if (section.key == 'profile') return const ProfileSection();
    return SectionPlaceholder(workspace: workspace, section: section);
  }
}

class _DrawerHeader extends StatelessWidget {
  const _DrawerHeader({required this.workspace, required this.name});

  final Workspace workspace;
  final String name;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(Spacing.lg, Spacing.lg, Spacing.md, Spacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'DODO Universe',
            style: theme.textTheme.labelLarge?.copyWith(
              color: theme.colorScheme.primary,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: Spacing.xs),
          Text(
            name.isEmpty ? '${workspace.label} workspace' : name,
            style: theme.textTheme.titleMedium,
          ),
          Text(
            '${workspace.label} workspace',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

