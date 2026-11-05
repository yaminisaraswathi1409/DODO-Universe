import 'package:flutter/material.dart';

import '../../../shared/models/workspace.dart';
import '../../../shared/widgets/workspace_shell.dart';

/// Vendor dashboard (Phase 1: navigation and placeholders only).
class VendorDashboard extends StatelessWidget {
  const VendorDashboard({super.key, required this.sectionKey});

  final String sectionKey;

  @override
  Widget build(BuildContext context) =>
      WorkspaceShell(workspace: Workspace.vendor, sectionKey: sectionKey);
}

