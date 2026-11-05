import 'package:flutter/material.dart';

import '../../../shared/models/workspace.dart';
import '../../../shared/widgets/workspace_shell.dart';

/// Customer dashboard (Phase 1: navigation and placeholders only).
class CustomerDashboard extends StatelessWidget {
  const CustomerDashboard({super.key, required this.sectionKey});

  final String sectionKey;

  @override
  Widget build(BuildContext context) =>
      WorkspaceShell(workspace: Workspace.customer, sectionKey: sectionKey);
}

