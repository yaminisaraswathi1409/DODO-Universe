import 'package:flutter/material.dart';

import '../../../app/theme/app_theme.dart';

/// Shared layout for the unauthenticated screens: scrollable, centered and
/// width-constrained so it works on phones and tablets.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.children,
    this.showBack = false,
    this.actions,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;
  final bool showBack;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: (showBack || (actions != null && actions!.isNotEmpty))
          ? AppBar(
              automaticallyImplyLeading: showBack,
              actions: actions,
            )
          : null,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Spacing.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'DODO Universe',
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: theme.colorScheme.primary,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: Spacing.sm),
                  Semantics(
                    header: true,
                    child: Text(title, style: theme.textTheme.headlineMedium),
                  ),
                  const SizedBox(height: Spacing.sm),
                  Text(
                    subtitle,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: Spacing.lg),
                  ...children,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

