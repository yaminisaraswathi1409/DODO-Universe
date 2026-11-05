import 'package:flutter/material.dart';

import '../../app/theme/app_theme.dart';
import '../../core/widgets/state_widgets.dart';
import '../../shared/models/workspace.dart';

/// Phase 1 placeholder for sections whose business workflows are built in later
/// phases. Never shows fake data.
class SectionPlaceholder extends StatelessWidget {
  const SectionPlaceholder({
    super.key,
    required this.workspace,
    required this.section,
  });

  final Workspace workspace;
  final WorkspaceSection section;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(Spacing.md),
      child: EmptyState(
        icon: section.icon,
        title: section.label,
        message: '${section.description}\n\nThis section is a navigation '
            'placeholder. Its workflow will be connected to the existing '
            'backend in a later phase.',
      ),
    );
  }
}

