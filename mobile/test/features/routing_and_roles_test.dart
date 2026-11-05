import 'package:dodo_universe/app/router/app_router.dart';
import 'package:dodo_universe/features/authentication/application/auth_controller.dart';
import 'package:dodo_universe/features/authentication/domain/auth_models.dart';
import 'package:dodo_universe/features/authentication/domain/phone_input.dart';
import 'package:dodo_universe/shared/models/workspace.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

void main() {
  group('UserCapabilities.derive', () {
    test('plain user is customer only', () {
      final caps = UserCapabilities.derive(testUser(), const []);
      expect(caps.workspaces, [Workspace.customer]);
      expect(caps.defaultWorkspace, Workspace.customer);
    });

    test('ADMIN and SUPER_ADMIN get the admin workspace only', () {
      for (final role in ['ADMIN', 'SUPER_ADMIN']) {
        final caps = UserCapabilities.derive(testUser(role: role), const []);
        expect(caps.workspaces, [Workspace.admin], reason: role);
      }
    });

    test('unapproved services grant nothing', () {
      final caps = UserCapabilities.derive(testUser(), [
        service('TRACTOR', status: 'PENDING_APPROVAL'),
        service('DRIVER', status: 'REJECTED'),
        service('PLUMBER', status: 'DOCUMENTS_PENDING'),
      ]);
      expect(caps.workspaces, [Workspace.customer]);
    });

    test('approved service unlocks vendor; approved driver profile unlocks driver', () {
      final caps = UserCapabilities.derive(testUser(driverProfileStatus: 'APPROVED'), [
        service('TRACTOR'),
      ]);
      expect(caps.isVendor, isTrue);
      expect(caps.isDriver, isTrue);
      expect(caps.workspaces, [Workspace.customer, Workspace.vendor, Workspace.driver]);
    });

    test('a user cannot be an admin because of services', () {
      final caps = UserCapabilities.derive(testUser(), [service('ADMIN')]);
      expect(caps.isAdmin, isFalse);
      expect(caps.workspaces, isNot(contains(Workspace.admin)));
    });
  });

  group('resolveRedirect (role-based navigation)', () {
    test('restoring session always shows splash', () {
      expect(resolveRedirect(const AuthRestoring(), '/login'), AppRoutes.splash);
      expect(resolveRedirect(const AuthRestoring(), AppRoutes.splash), isNull);
    });

    test('signed-out users can only reach the public auth routes', () {
      const out = Unauthenticated();
      expect(resolveRedirect(out, '/login'), isNull);
      expect(resolveRedirect(out, '/signup'), isNull);
      expect(resolveRedirect(out, '/verify-otp'), isNull);
      expect(resolveRedirect(out, '/w/customer/home'), '/login');
      expect(resolveRedirect(out, '/w/admin/home'), '/login');
      expect(resolveRedirect(out, '/splash'), '/login');
    });

    test('active customer lands on customer home and leaves auth routes', () {
      final auth = authed(testUser());
      expect(resolveRedirect(auth, '/login'), '/w/customer/home');
      expect(resolveRedirect(auth, '/splash'), '/w/customer/home');
      expect(resolveRedirect(auth, '/w/customer/orders'), isNull);
    });

    test('ordinary users cannot open admin, vendor or driver workspaces', () {
      final auth = authed(testUser());
      expect(resolveRedirect(auth, '/w/admin/home'), '/w/customer/home');
      expect(resolveRedirect(auth, '/w/admin/vendors'), '/w/customer/home');
      expect(resolveRedirect(auth, '/w/vendor/home'), '/w/customer/home');
      expect(resolveRedirect(auth, '/w/driver/home'), '/w/customer/home');
    });

    test('admin lands on admin home and cannot open the customer workspace', () {
      final auth = authed(testUser(role: 'ADMIN'));
      expect(resolveRedirect(auth, '/login'), '/w/admin/home');
      expect(resolveRedirect(auth, '/w/admin/catalog-approvals'), isNull);
      expect(resolveRedirect(auth, '/w/customer/home'), '/w/admin/home');
    });

    test('vendor with approved service may open both customer and vendor', () {
      final auth = authed(testUser(), services: [service('TRACTOR')]);
      expect(resolveRedirect(auth, '/w/vendor/catalog'), isNull);
      expect(resolveRedirect(auth, '/w/customer/home'), isNull);
      expect(resolveRedirect(auth, '/w/driver/home'), '/w/customer/home');
    });

    test('unknown section falls back to the workspace home', () {
      final auth = authed(testUser());
      expect(resolveRedirect(auth, '/w/customer/nope'), '/w/customer/home');
      expect(resolveRedirect(auth, '/w/customer'), '/w/customer/home');
    });

    test('suspended accounts are confined to the suspended screen', () {
      for (final user in [
        testUser(suspended: true),
        testUser(status: 'SUSPENDED'),
        testUser(status: 'DEACTIVATED'),
        testUser(role: 'ADMIN', suspended: true),
      ]) {
        final auth = authed(user);
        expect(resolveRedirect(auth, '/w/customer/home'), AppRoutes.suspended);
        expect(resolveRedirect(auth, '/w/admin/home'), AppRoutes.suspended);
        expect(resolveRedirect(auth, AppRoutes.suspended), isNull);
      }
    });

    test('incomplete onboarding is confined to the appropriate onboarding step', () {
      final otpVerifiedAuth = authed(testUser(status: 'OTP_VERIFIED'));
      expect(resolveRedirect(otpVerifiedAuth, '/w/customer/home'), AppRoutes.completeProfile);
      expect(resolveRedirect(otpVerifiedAuth, AppRoutes.completeProfile), isNull);

      final profileCompletedAuth = authed(testUser(status: 'PROFILE_COMPLETED'));
      expect(resolveRedirect(profileCompletedAuth, '/w/customer/home'), AppRoutes.verifyFace);
      expect(resolveRedirect(profileCompletedAuth, AppRoutes.verifyFace), isNull);

      final pendingAuth = authed(testUser(status: 'PENDING'));
      expect(resolveRedirect(pendingAuth, '/w/customer/home'), AppRoutes.completeProfile);
    });

    test('active accounts are redirected away from onboarding screens to dashboard', () {
      final activeAuth = authed(testUser(status: 'ACTIVE'));
      expect(resolveRedirect(activeAuth, AppRoutes.completeProfile), '/w/customer/home');
      expect(resolveRedirect(activeAuth, AppRoutes.verifyFace), '/w/customer/home');
      expect(resolveRedirect(activeAuth, AppRoutes.onboardingIncomplete), '/w/customer/home');
      expect(resolveRedirect(activeAuth, AppRoutes.login), '/w/customer/home');
    });

    test('admin bypasses the onboarding gate, as on the web app', () {
      final auth = authed(testUser(role: 'ADMIN', status: 'OTP_VERIFIED'));
      expect(resolveRedirect(auth, '/login'), '/w/admin/home');
    });
  });

  group('Workspace navigation definitions', () {
    List<String> labels(Workspace w) => w.sections.map((s) => s.label).toList();

    test('customer sections', () {
      expect(labels(Workspace.customer), [
        'Home', 'Marketplace', 'Categories', 'My Orders', 'My Requests', 'Profile',
      ]);
    });

    test('vendor sections', () {
      expect(labels(Workspace.vendor), [
        'Vendor Home', 'My Categories', 'My Catalog', 'Incoming Orders',
        'My Services', 'Profile',
      ]);
    });

    test('driver sections', () {
      expect(labels(Workspace.driver), [
        'Driver Home', 'Available Jobs', 'Assigned Deliveries', 'My Journeys', 'Profile',
      ]);
    });

    test('admin sections', () {
      expect(labels(Workspace.admin), [
        'Admin Home', 'Category Governance', 'Vendor Management',
        'Catalog Approvals', 'Order Operations', 'Notifications',
      ]);
    });

    test('section keys are unique within each workspace', () {
      for (final w in Workspace.values) {
        final keys = w.sections.map((s) => s.key).toList();
        expect(keys.toSet().length, keys.length, reason: w.name);
      }
    });
  });

  group('PhoneInput', () {
    test('accepts 10-digit and +country numbers, rejects the rest', () {
      expect(PhoneInput.validate('9876543210'), isNull);
      expect(PhoneInput.validate('+14155550123'), isNull);
      expect(PhoneInput.validate('98765 43210'), isNull);
      expect(PhoneInput.validate(''), isNotNull);
      expect(PhoneInput.validate('12345'), isNotNull);
      expect(PhoneInput.validate('abcdefghij'), isNotNull);
    });

    test('normalises national numbers to +91', () {
      expect(PhoneInput.normalize('98765 43210'), '+919876543210');
      expect(PhoneInput.normalize('+14155550123'), '+14155550123');
    });
  });

  group('AppUser parsing', () {
    test('parses identity and status fields from the backend user', () {
      final user =
          AppUser.fromJson(userJson(role: 'ADMIN', status: 'OTP_VERIFIED'));
      expect(user.id, 'user-id-1');
      expect(user.fullName, 'Test User');
      expect(user.isAdmin, isTrue);
      expect(user.isActive, isFalse);
    });

    test('missing role defaults to USER', () {
      final json = userJson()..remove('role');
      expect(AppUser.fromJson(json).role, 'USER');
    });
  });
}

