import 'package:dodo_universe/app/app.dart';
import 'package:dodo_universe/app/router/app_router.dart';
import 'package:dodo_universe/core/api/api_providers.dart';
import 'package:dodo_universe/core/errors/app_exception.dart';
import 'package:dodo_universe/core/storage/secure_storage.dart';
import 'package:dodo_universe/features/authentication/application/auth_controller.dart';
import 'package:dodo_universe/features/authentication/domain/auth_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

Widget appWith({
  AuthState? fixedAuth,
  FakeAuthRepository? repo,
  InMemorySecureKeyValueStore? store,
}) {
  return ProviderScope(
    overrides: [
      secureStoreProvider.overrideWithValue(store ?? InMemorySecureKeyValueStore()),
      if (repo != null) authRepositoryProvider.overrideWithValue(repo),
      if (fixedAuth != null)
        authControllerProvider.overrideWith(() => FixedAuthController(fixedAuth)),
    ],
    child: const DodoApp(),
  );
}

Authenticated authed(
  AppUser user, {
  List<ServiceAsset> services = const [],
  bool verified = true,
}) =>
    Authenticated(
      user: user,
      capabilities: UserCapabilities.derive(user, services),
      capabilitiesVerified: verified,
    );

ProviderContainer containerOf(WidgetTester tester) =>
    ProviderScope.containerOf(tester.element(find.byType(DodoApp)));

void main() {
  group('Application startup', () {
    testWidgets('signed-out start shows the login screen after restore', (tester) async {
      await tester.pumpWidget(appWith(repo: FakeAuthRepository()));
      await tester.pumpAndSettle();

      expect(find.text('Sign in'), findsWidgets);
      expect(find.text('Send OTP'), findsOneWidget);
    });

    testWidgets('shows a restoring indicator while the session is validated', (tester) async {
      await tester.pumpWidget(appWith(fixedAuth: const AuthRestoring()));
      await tester.pump();

      expect(find.text('Restoring your session...'), findsOneWidget);
    });

    testWidgets('a stored valid credential restores straight into the dashboard', (tester) async {
      final store = InMemorySecureKeyValueStore()
        ..values[SessionStorage.accessTokenKey] = 'access-1'
        ..values[SessionStorage.refreshTokenKey] = 'refresh-1';
      await tester.pumpWidget(
        appWith(store: store, repo: FakeAuthRepository(currentUser: testUser())),
      );
      await tester.pumpAndSettle();

      expect(find.text('Customer dashboard'), findsOneWidget);
      expect(find.text('Send OTP'), findsNothing);
    });
  });

  group('Auth screens', () {
    testWidgets('login screen renders phone field and actions', (tester) async {
      await tester.pumpWidget(appWith(fixedAuth: const Unauthenticated()));
      await tester.pumpAndSettle();

      expect(find.byType(TextFormField), findsOneWidget);
      expect(find.text('Mobile number'), findsOneWidget);
      expect(find.text('Send OTP'), findsOneWidget);
      expect(find.text('New to DODO? Create an account'), findsOneWidget);
      // There is no password login in the backend, so no password field.
      expect(find.text('Password'), findsNothing);
    });

    testWidgets('login validates the phone number before calling the backend', (tester) async {
      final repo = FakeAuthRepository();
      await tester.pumpWidget(appWith(fixedAuth: const Unauthenticated(), repo: repo));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Send OTP'));
      await tester.pump();

      expect(find.text('Enter your mobile number'), findsOneWidget);
      expect(repo.requestedOtpPhones, isEmpty);
    });

    testWidgets('login sends a normalised phone and opens the OTP screen', (tester) async {
      final repo = FakeAuthRepository();
      await tester.pumpWidget(appWith(fixedAuth: const Unauthenticated(), repo: repo));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField), '98765 43210');
      await tester.tap(find.text('Send OTP'));
      await tester.pumpAndSettle();

      expect(repo.requestedOtpPhones, ['+919876543210']);
      expect(find.text('Enter code'), findsOneWidget);
      expect(find.textContaining('+919876543210'), findsOneWidget);
    });

    testWidgets('login shows a backend error', (tester) async {
      final repo = FakeAuthRepository(
        requestOtpError: const ServerException('Failed to request OTP code'),
      );
      await tester.pumpWidget(appWith(fixedAuth: const Unauthenticated(), repo: repo));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField), '9876543210');
      await tester.tap(find.text('Send OTP'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Failed to request OTP code'), findsOneWidget);
    });

    testWidgets('session-expired notice is shown on the login screen', (tester) async {
      await tester.pumpWidget(
        appWith(
          fixedAuth: const Unauthenticated(
            notice: 'Your session has expired. Please sign in again.',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Your session has expired. Please sign in again.'), findsOneWidget);
    });

    testWidgets('signup screen renders the backend-supported fields', (tester) async {
      await tester.pumpWidget(appWith(fixedAuth: const Unauthenticated()));
      await tester.pumpAndSettle();

      containerOf(tester).read(routerProvider).go('/signup');
      await tester.pumpAndSettle();

      expect(find.text('Create account'), findsWidgets);
      expect(find.text('Full name'), findsOneWidget);
      expect(find.text('Mobile number'), findsOneWidget);
      expect(find.text('Email (optional)'), findsOneWidget);
      expect(find.byType(TextFormField), findsNWidgets(3));
    });

    testWidgets('signup validates required fields and email format', (tester) async {
      final repo = FakeAuthRepository();
      await tester.pumpWidget(appWith(fixedAuth: const Unauthenticated(), repo: repo));
      await tester.pumpAndSettle();
      containerOf(tester).read(routerProvider).go('/signup');
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextFormField).at(2), 'not-an-email');
      await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
      await tester.pump();

      expect(find.text('Enter your full name'), findsOneWidget);
      expect(find.text('Enter your mobile number'), findsOneWidget);
      expect(find.text('Enter a valid email address'), findsOneWidget);
      expect(repo.signupPhones, isEmpty);
    });

    testWidgets('OTP route without arguments falls back to login', (tester) async {
      await tester.pumpWidget(appWith(fixedAuth: const Unauthenticated()));
      await tester.pumpAndSettle();

      containerOf(tester).read(routerProvider).go('/verify-otp');
      await tester.pumpAndSettle();

      expect(find.text('Send OTP'), findsOneWidget);
    });
  });

  group('Role-based dashboards', () {
    testWidgets('customer dashboard renders and lists its navigation', (tester) async {
      await tester.pumpWidget(appWith(fixedAuth: authed(testUser())));
      await tester.pumpAndSettle();

      expect(find.text('Customer dashboard'), findsOneWidget);
      expect(find.text('Hello, Test User'), findsOneWidget);

      await tester.tap(find.byTooltip('Open navigation menu'));
      await tester.pumpAndSettle();
      for (final label in ['Home', 'Marketplace', 'Categories', 'My Orders', 'My Requests', 'Profile']) {
        expect(find.text(label), findsWidgets, reason: label);
      }
      expect(find.text('Sign out'), findsOneWidget);
      // Single-role user is not offered other workspaces.
      expect(find.textContaining('Switch to'), findsNothing);
    });

    testWidgets('vendor dashboard renders for a user with approved services', (tester) async {
      final auth = authed(
        testUser(),
        services: const [
          ServiceAsset(id: '1', assetType: 'TRACTOR', title: 't', status: 'APPROVED'),
        ],
      );
      await tester.pumpWidget(appWith(fixedAuth: auth));
      await tester.pumpAndSettle();
      containerOf(tester).read(routerProvider).go('/w/vendor/home');
      await tester.pumpAndSettle();

      expect(find.text('Vendor dashboard'), findsOneWidget);
      expect(find.text('Incoming Orders'), findsOneWidget);
      expect(find.text('My Catalog'), findsOneWidget);
    });

    testWidgets('driver dashboard renders for a user with an approved driver service', (tester) async {
      final auth = authed(
        testUser(driverProfileStatus: 'APPROVED'),
        services: const [
          ServiceAsset(id: '1', assetType: 'TRUCK_DRIVER', title: 't', status: 'ACTIVE'),
        ],
      );
      await tester.pumpWidget(appWith(fixedAuth: auth));
      await tester.pumpAndSettle();
      containerOf(tester).read(routerProvider).go('/w/driver/home');
      await tester.pumpAndSettle();

      expect(find.text('Driver dashboard'), findsOneWidget);
      expect(find.text('Available Jobs'), findsOneWidget);
      expect(find.text('Assigned Deliveries'), findsOneWidget);
    });

    testWidgets('admin dashboard is the landing page for an admin', (tester) async {
      await tester.pumpWidget(appWith(fixedAuth: authed(testUser(role: 'ADMIN'))));
      await tester.pumpAndSettle();

      expect(find.text('Admin dashboard'), findsOneWidget);
      expect(find.text('Category Governance'), findsOneWidget);
      expect(find.text('Order Operations'), findsOneWidget);
    });

    testWidgets('an ordinary user is redirected away from admin routes', (tester) async {
      await tester.pumpWidget(appWith(fixedAuth: authed(testUser())));
      await tester.pumpAndSettle();

      containerOf(tester).read(routerProvider).go('/w/admin/home');
      await tester.pumpAndSettle();

      expect(find.text('Admin dashboard'), findsNothing);
      expect(find.text('Customer dashboard'), findsOneWidget);
    });

    testWidgets('multi-capability user can switch between permitted workspaces', (tester) async {
      final auth = authed(
        testUser(),
        services: const [
          ServiceAsset(id: '1', assetType: 'TRACTOR', title: 't', status: 'APPROVED'),
        ],
      );
      await tester.pumpWidget(appWith(fixedAuth: auth));
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Open navigation menu'));
      await tester.pumpAndSettle();
      expect(find.text('Switch to Vendor'), findsOneWidget);
      expect(find.text('Switch to Admin'), findsNothing);
      expect(find.text('Switch to Driver'), findsNothing);

      await tester.tap(find.text('Switch to Vendor'));
      await tester.pumpAndSettle();
      expect(find.text('Vendor dashboard'), findsOneWidget);
    });

    testWidgets('placeholder sections make clear they are not implemented yet', (tester) async {
      await tester.pumpWidget(appWith(fixedAuth: authed(testUser())));
      await tester.pumpAndSettle();
      containerOf(tester).read(routerProvider).go('/w/customer/orders');
      await tester.pumpAndSettle();

      expect(find.textContaining('navigation placeholder'), findsOneWidget);
    });

    testWidgets('profile shows backend account details', (tester) async {
      await tester.pumpWidget(appWith(fixedAuth: authed(testUser())));
      await tester.pumpAndSettle();
      containerOf(tester).read(routerProvider).go('/w/customer/profile');
      await tester.pumpAndSettle();

      expect(find.text('Test User'), findsOneWidget);
      expect(find.text('+910000000000'), findsOneWidget);
      expect(find.text('ACTIVE'), findsOneWidget);
    });

    testWidgets('wide layout uses a navigation rail', (tester) async {
      tester.view.physicalSize = const Size(1200, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(appWith(fixedAuth: authed(testUser())));
      await tester.pumpAndSettle();

      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byType(NavigationDrawer), findsNothing);
    });

    testWidgets('sign out returns to the login screen', (tester) async {
      final store = InMemorySecureKeyValueStore()
        ..values[SessionStorage.accessTokenKey] = 'access-1'
        ..values[SessionStorage.refreshTokenKey] = 'refresh-1';
      await tester.pumpWidget(
        appWith(store: store, repo: FakeAuthRepository(currentUser: testUser())),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Open navigation menu'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();

      expect(find.text('Send OTP'), findsOneWidget);
      expect(store.values, isEmpty);
    });
  });

  group('Account gates', () {
    testWidgets('suspended account sees only the suspended screen', (tester) async {
      await tester.pumpWidget(appWith(fixedAuth: authed(testUser(status: 'SUSPENDED'))));
      await tester.pumpAndSettle();

      expect(find.text('Account suspended'), findsOneWidget);
      expect(find.text('Customer dashboard'), findsNothing);
      expect(find.text('Sign out'), findsOneWidget);
    });

    testWidgets('incomplete onboarding routes to complete profile screen', (tester) async {
      await tester.pumpWidget(appWith(fixedAuth: authed(testUser(status: 'OTP_VERIFIED'))));
      await tester.pumpAndSettle();

      expect(find.text('Complete Profile Details'), findsOneWidget);
      expect(find.text('Customer dashboard'), findsNothing);
    });

    testWidgets('profile completed status routes to face verification screen', (tester) async {
      await tester.pumpWidget(appWith(fixedAuth: authed(testUser(status: 'PROFILE_COMPLETED'))));
      await tester.pumpAndSettle();

      expect(find.text('Face ID Verification'), findsOneWidget);
      expect(find.text('Customer dashboard'), findsNothing);
    });
  });
}
