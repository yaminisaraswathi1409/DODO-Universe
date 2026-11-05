import 'package:flutter/material.dart';

/// Shared app bar so every screen has the same look and behaviour.
class DodoAppBar extends StatelessWidget implements PreferredSizeWidget {
  const DodoAppBar({super.key, required this.title, this.actions});

  final String title;
  final List<Widget>? actions;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      title: Semantics(header: true, child: Text(title)),
      actions: actions,
    );
  }
}

