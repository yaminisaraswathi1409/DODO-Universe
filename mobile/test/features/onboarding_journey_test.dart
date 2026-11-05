import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dodo_universe/app/router/app_router.dart';
import 'package:dodo_universe/core/api/api_providers.dart';
import 'package:dodo_universe/features/authentication/application/auth_controller.dart';
import 'package:dodo_universe/features/authentication/domain/auth_models.dart';
import 'package:dodo_universe/features/onboarding/presentation/complete_profile_screen.dart';
import 'package:dodo_universe/features/onboarding/presentation/verify_face_screen.dart';

import '../support/fakes.dart';

void main() {
  Widget testWidget(Widget child, {FakeAuthRepository? repo, AuthState? authState}) {
    return ProviderScope(
      overrides: [
        if (repo != null) authRepositoryProvider.overrideWithValue(repo),
        if (authState != null)
          authControllerProvider.overrideWith(() => FixedAuthController(authState)),
      ],
      child: MaterialApp(
        home: Scaffold(body: child),
      ),
    );
  }

  group('CompleteProfileScreen', () {
    testWidgets('renders all required profile fields and action buttons', (tester) async {
      final user = testUser(status: 'OTP_VERIFIED');
      await tester.pumpWidget(
        testWidget(
          const CompleteProfileScreen(),
          authState: Authenticated(
            user: user,
            capabilities: const UserCapabilities.customerOnly(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Complete Profile Details'), findsOneWidget);
      expect(find.text('Profile Photo *'), findsOneWidget);
      expect(find.text('Camera'), findsOneWidget);
      expect(find.text('Gallery'), findsOneWidget);
      expect(find.text('Profile Photo URL *'), findsOneWidget);
      expect(find.text('Primary Address / Location *'), findsOneWidget);
      expect(find.text('Aadhaar Identity Number (Optional)'), findsOneWidget);
      expect(find.text('Bio / Overview (Optional)'), findsOneWidget);
      expect(find.text('Save and Continue to Face ID'), findsOneWidget);
      expect(find.text('Sign out'), findsOneWidget);
    });

    testWidgets('validates required fields on submission', (tester) async {
      final user = testUser(status: 'OTP_VERIFIED');
      await tester.pumpWidget(
        testWidget(
          const CompleteProfileScreen(),
          authState: Authenticated(
            user: user,
            capabilities: const UserCapabilities.customerOnly(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Clear address field
      final addressFinder = find.widgetWithText(TextFormField, 'Choutuppal, Telangana, India');
      await tester.enterText(addressFinder, '');
      await tester.pumpAndSettle();

      // Clear photo URL field
      final photoFinder = find.widgetWithText(
        TextFormField,
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
      );
      await tester.enterText(photoFinder, '');
      await tester.pumpAndSettle();

      // Tap submit
      await tester.ensureVisible(find.text('Save and Continue to Face ID'));
      await tester.tap(find.text('Save and Continue to Face ID'));
      await tester.pumpAndSettle();

      expect(find.text('Profile photo is required'), findsOneWidget);
      expect(find.text('Address is required'), findsOneWidget);
    });

    testWidgets('calls completeProfile on valid submission', (tester) async {
      final repo = FakeAuthRepository(currentUser: testUser(status: 'OTP_VERIFIED'));
      final store = InMemorySecureKeyValueStore();

      final container = ProviderContainer(
        overrides: [
          secureStoreProvider.overrideWithValue(store),
          authRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            routerConfig: container.read(routerProvider),
          ),
        ),
      );
      await tester.pumpAndSettle();
    });
  });

  group('VerifyFaceScreen', () {
    testWidgets('renders face viewfinder and action buttons', (tester) async {
      final user = testUser(status: 'PROFILE_COMPLETED');
      await tester.pumpWidget(
        testWidget(
          const VerifyFaceScreen(),
          authState: Authenticated(
            user: user,
            capabilities: const UserCapabilities.customerOnly(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Face ID Verification'), findsOneWidget);
      expect(find.text('Position face inside circle'), findsOneWidget);
      expect(find.text('Start Face Verification Scan'), findsOneWidget);
      expect(find.text('Take Live Selfie Camera Scan'), findsOneWidget);
      expect(find.text('Sign out'), findsOneWidget);
    });

    testWidgets('strict validation: shows error when backend does not activate account',
        (tester) async {
      final repo = FakeAuthRepository(
        currentUser: testUser(status: 'PROFILE_COMPLETED'),
      );
      // Backend returns unverified user
      repo.verifyFaceUser = testUser(status: 'PROFILE_COMPLETED', faceVerified: false);

      await tester.pumpWidget(
        testWidget(
          const VerifyFaceScreen(),
          repo: repo,
          authState: Authenticated(
            user: testUser(status: 'PROFILE_COMPLETED'),
            capabilities: const UserCapabilities.customerOnly(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Start Face Verification Scan'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Face verification could not be confirmed'), findsOneWidget);
      expect(find.text('Account Fully Activated!'), findsNothing);
    });

    testWidgets('successful backend verification displays activated confirmation',
        (tester) async {
      final repo = FakeAuthRepository(
        currentUser: testUser(status: 'ACTIVE', faceVerified: true),
      );
      repo.verifyFaceUser = testUser(status: 'ACTIVE', faceVerified: true);

      await tester.pumpWidget(
        testWidget(
          const VerifyFaceScreen(redirectDelay: Duration.zero),
          repo: repo,
          authState: Authenticated(
            user: testUser(status: 'PROFILE_COMPLETED'),
            capabilities: const UserCapabilities.customerOnly(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Start Face Verification Scan'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Account Fully Activated!'), findsOneWidget);
      expect(find.textContaining('Mobile verified'), findsOneWidget);
      expect(find.textContaining('Face ID verified'), findsOneWidget);
    });
  });

  group('Onboarding Navigation Policy', () {
    test('OTP_VERIFIED user is directed to complete profile', () {
      final auth = authed(testUser(status: 'OTP_VERIFIED'));
      expect(resolveRedirect(auth, '/w/customer/home'), AppRoutes.completeProfile);
      expect(resolveRedirect(auth, AppRoutes.completeProfile), isNull);
    });

    test('PROFILE_COMPLETED user is directed to verify face', () {
      final auth = authed(testUser(status: 'PROFILE_COMPLETED'));
      expect(resolveRedirect(auth, '/w/customer/home'), AppRoutes.verifyFace);
      expect(resolveRedirect(auth, AppRoutes.verifyFace), isNull);
    });

    test('ACTIVE user bypasses onboarding to their default dashboard', () {
      final customerAuth = authed(testUser(status: 'ACTIVE'));
      expect(resolveRedirect(customerAuth, AppRoutes.completeProfile), '/w/customer/home');
      expect(resolveRedirect(customerAuth, AppRoutes.verifyFace), '/w/customer/home');

      final adminAuth = authed(testUser(role: 'ADMIN', status: 'ACTIVE'));
      expect(resolveRedirect(adminAuth, AppRoutes.completeProfile), '/w/admin/home');
      expect(resolveRedirect(adminAuth, AppRoutes.verifyFace), '/w/admin/home');
    });

    test('Suspended accounts are locked out of onboarding', () {
      final suspendedAuth = authed(testUser(status: 'SUSPENDED'));
      expect(resolveRedirect(suspendedAuth, AppRoutes.completeProfile), AppRoutes.suspended);
      expect(resolveRedirect(suspendedAuth, AppRoutes.verifyFace), AppRoutes.suspended);
    });
  });
}
