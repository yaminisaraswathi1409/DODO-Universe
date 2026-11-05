import 'package:flutter/material.dart';

/// One navigation entry of a [Workspace].
class WorkspaceSection {
  const WorkspaceSection({
    required this.key,
    required this.label,
    required this.icon,
    required this.description,
  });

  /// URL segment: `/w/<workspace>/<key>`.
  final String key;
  final String label;
  final IconData icon;

  /// Shown on the Phase 1 placeholder.
  final String description;

  bool get isHome => key == 'home';
}

/// The four role-based dashboards inside the single DODO Universe app.
///
/// Which workspaces a signed-in user can open is decided by the backend
/// response (see `UserCapabilities`), never by user choice.
enum Workspace {
  customer(
    label: 'Customer',
    icon: Icons.person_outline,
    sections: [
      WorkspaceSection(
        key: 'home',
        label: 'Home',
        icon: Icons.home_outlined,
        description: 'Your DODO overview.',
      ),
      WorkspaceSection(
        key: 'marketplace',
        label: 'Marketplace',
        icon: Icons.storefront_outlined,
        description: 'Browse vendors and catalog offerings.',
      ),
      WorkspaceSection(
        key: 'categories',
        label: 'Categories',
        icon: Icons.category_outlined,
        description: 'Explore the platform category tree.',
      ),
      WorkspaceSection(
        key: 'orders',
        label: 'My Orders',
        icon: Icons.receipt_long_outlined,
        description: 'Track your orders and deliveries.',
      ),
      WorkspaceSection(
        key: 'requests',
        label: 'My Requests',
        icon: Icons.assignment_outlined,
        description: 'Opportunities and requests you created.',
      ),
      WorkspaceSection(
        key: 'profile',
        label: 'Profile',
        icon: Icons.account_circle_outlined,
        description: 'Your account details.',
      ),
    ],
  ),
  vendor(
    label: 'Vendor',
    icon: Icons.store_mall_directory_outlined,
    sections: [
      WorkspaceSection(
        key: 'home',
        label: 'Vendor Home',
        icon: Icons.home_outlined,
        description: 'Your vendor overview.',
      ),
      WorkspaceSection(
        key: 'categories',
        label: 'My Categories',
        icon: Icons.category_outlined,
        description: 'Category participation and approvals.',
      ),
      WorkspaceSection(
        key: 'catalog',
        label: 'My Catalog',
        icon: Icons.inventory_2_outlined,
        description: 'Manage catalog items and offerings.',
      ),
      WorkspaceSection(
        key: 'incoming-orders',
        label: 'Incoming Orders',
        icon: Icons.move_to_inbox_outlined,
        description: 'Orders waiting for your action.',
      ),
      WorkspaceSection(
        key: 'services',
        label: 'My Services',
        icon: Icons.handyman_outlined,
        description: 'Services and assets you registered.',
      ),
      WorkspaceSection(
        key: 'profile',
        label: 'Profile',
        icon: Icons.account_circle_outlined,
        description: 'Your account details.',
      ),
    ],
  ),
  driver(
    label: 'Driver',
    icon: Icons.local_shipping_outlined,
    sections: [
      WorkspaceSection(
        key: 'home',
        label: 'Driver Home',
        icon: Icons.home_outlined,
        description: 'Your driver overview.',
      ),
      WorkspaceSection(
        key: 'jobs',
        label: 'Available Jobs',
        icon: Icons.work_outline,
        description: 'Transport jobs you can accept.',
      ),
      WorkspaceSection(
        key: 'deliveries',
        label: 'Assigned Deliveries',
        icon: Icons.inventory_outlined,
        description: 'Deliveries assigned to you.',
      ),
      WorkspaceSection(
        key: 'journeys',
        label: 'My Journeys',
        icon: Icons.route_outlined,
        description: 'Registered journeys and status.',
      ),
      WorkspaceSection(
        key: 'profile',
        label: 'Profile',
        icon: Icons.account_circle_outlined,
        description: 'Your account details.',
      ),
    ],
  ),
  admin(
    label: 'Admin',
    icon: Icons.admin_panel_settings_outlined,
    sections: [
      WorkspaceSection(
        key: 'home',
        label: 'Admin Home',
        icon: Icons.dashboard_outlined,
        description: 'Platform operations overview.',
      ),
      WorkspaceSection(
        key: 'category-governance',
        label: 'Category Governance',
        icon: Icons.account_tree_outlined,
        description: 'Category hierarchy and vendor category approvals.',
      ),
      WorkspaceSection(
        key: 'vendors',
        label: 'Vendor Management',
        icon: Icons.groups_outlined,
        description: 'Vendor services, documents and suspensions.',
      ),
      WorkspaceSection(
        key: 'catalog-approvals',
        label: 'Catalog Approvals',
        icon: Icons.fact_check_outlined,
        description: 'Review submitted catalog items.',
      ),
      WorkspaceSection(
        key: 'order-operations',
        label: 'Order Operations',
        icon: Icons.monitor_heart_outlined,
        description: 'Metrics, stuck orders and incidents.',
      ),
      WorkspaceSection(
        key: 'notifications',
        label: 'Notifications',
        icon: Icons.notifications_outlined,
        description: 'Platform and account notifications.',
      ),
    ],
  );

  const Workspace({
    required this.label,
    required this.icon,
    required this.sections,
  });

  final String label;
  final IconData icon;
  final List<WorkspaceSection> sections;

  String get key => name;

  String get homePath => '/w/$key/home';

  String pathFor(WorkspaceSection section) => '/w/$key/${section.key}';

  WorkspaceSection? sectionByKey(String sectionKey) {
    for (final section in sections) {
      if (section.key == sectionKey) return section;
    }
    return null;
  }

  static Workspace? fromKey(String key) {
    for (final workspace in Workspace.values) {
      if (workspace.key == key) return workspace;
    }
    return null;
  }
}

