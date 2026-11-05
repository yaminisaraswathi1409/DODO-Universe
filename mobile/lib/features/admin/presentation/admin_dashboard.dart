import 'package:flutter/material.dart';

import '../../../shared/models/workspace.dart';
import '../../../shared/widgets/workspace_shell.dart';

/// Admin dashboard (Phase 1: navigation and placeholders only). Access is
/// enforced by the router from the backend-reported role, and by the backend
/// on every API call.
class AdminDashboard extends StatelessWidget {
  const AdminDashboard({super.key, required this.sectionKey});

  final String sectionKey;

  @override
  Widget build(BuildContext context) =>
      WorkspaceShell(workspace: Workspace.admin, sectionKey: sectionKey);
}

