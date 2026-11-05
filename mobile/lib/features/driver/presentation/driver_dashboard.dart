import 'package:flutter/material.dart';

import '../../../shared/models/workspace.dart';
import '../../../shared/widgets/workspace_shell.dart';

/// Driver dashboard (Phase 1: navigation and placeholders only).
class DriverDashboard extends StatelessWidget {
  const DriverDashboard({super.key, required this.sectionKey});

  final String sectionKey;

  @override
  Widget build(BuildContext context) =>
      WorkspaceShell(workspace: Workspace.driver, sectionKey: sectionKey);
}

