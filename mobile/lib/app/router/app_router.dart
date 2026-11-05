import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/state_widgets.dart';
import '../../features/admin/presentation/admin_dashboard.dart';
import '../../features/authentication/application/auth_controller.dart';
import '../../features/authentication/presentation/login_screen.dart';
import '../../features/authentication/presentation/otp_screen.dart';
import '../../features/authentication/presentation/signup_screen.dart';
import '../../features/customer/presentation/customer_dashboard.dart';
import '../../features/driver/presentation/driver_dashboard.dart';
import '../../features/onboarding/presentation/complete_profile_screen.dart';
import '../../features/onboarding/presentation/verify_face_screen.dart';
import '../../features/profile/presentation/account_gate_screen.dart';
import '../../features/vendor/presentation/vendor_dashboard.dart';
import '../../shared/models/workspace.dart';

abstract final class AppRoutes {
  static const splash = '/splash';
  static const login = '/login';
  static const signup = '/signup';
  static const verifyOtp = '/verify-otp';
  static const completeProfile = '/complete-profile';
  static const verifyFace = '/verify-face';
  static const suspended = '/account-suspended';
  static const onboardingIncomplete = '/onboarding-incomplete';
}

/// Central, pure routing policy. Access is derived only from [AuthState], which
/// is built from backend responses; there is no user-selected role.
///
/// Returns the location to redirect to, or `null` to stay on [location].
String? resolveRedirect(AuthState auth, String location) {
  const publicAuthRoutes = {
    AppRoutes.login,
    AppRoutes.signup,
    AppRoutes.verifyOtp,
  };

  const onboardingRoutes = {
    AppRoutes.completeProfile,
    AppRoutes.verifyFace,
    AppRoutes.onboardingIncomplete,
  };

  switch (auth) {
    case AuthRestoring():
      return location == AppRoutes.splash ? null : AppRoutes.splash;

    case Unauthenticated():
      return publicAuthRoutes.contains(location) ? null : AppRoutes.login;

    case Authenticated(:final user, :final capabilities):
      if (user.isSuspended) {
        return location == AppRoutes.suspended ? null : AppRoutes.suspended;
      }
      // Admins bypass the onboarding gate, as the web app does.
      if (!user.isActive && !user.isAdmin) {
        if (user.status == 'PROFILE_COMPLETED') {
          return location == AppRoutes.verifyFace ? null : AppRoutes.verifyFace;
        }
        return location == AppRoutes.completeProfile
            ? null
            : AppRoutes.completeProfile;
      }

      final home = capabilities.defaultWorkspace.homePath;

      // Active and admin users must not remain on authentication or onboarding screens
      if (publicAuthRoutes.contains(location) ||
          onboardingRoutes.contains(location) ||
          location == AppRoutes.splash ||
          location == AppRoutes.suspended) {
        return home;
      }

      if (!location.startsWith('/w/')) return home;

      final parts = location.split('/'); // ['', 'w', workspace, section]
      final workspace = parts.length > 2 ? Workspace.fromKey(parts[2]) : null;
      if (workspace == null || !capabilities.workspaces.contains(workspace)) {
        return home;
      }
      if (parts.length < 4 || workspace.sectionByKey(parts[3]) == null) {
        return workspace.homePath;
      }
      return null;
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen<AuthState>(authControllerProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  final router = GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: refresh,
    redirect: (context, state) =>
        resolveRedirect(ref.read(authControllerProvider), state.matchedLocation),
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (_, _) => const Scaffold(
          body: LoadingIndicator(message: 'Restoring your session...'),
        ),
      ),
      GoRoute(path: AppRoutes.login, builder: (_, _) => const LoginScreen()),
      GoRoute(path: AppRoutes.signup, builder: (_, _) => const SignupScreen()),
      GoRoute(
        path: AppRoutes.verifyOtp,
        redirect: (_, state) =>
            state.extra is OtpArgs ? null : AppRoutes.login,
        builder: (_, state) => OtpScreen(args: state.extra! as OtpArgs),
      ),
      GoRoute(
        path: AppRoutes.completeProfile,
        builder: (_, _) => const CompleteProfileScreen(),
      ),
      GoRoute(
        path: AppRoutes.verifyFace,
        builder: (_, _) => const VerifyFaceScreen(),
      ),
      GoRoute(
        path: AppRoutes.suspended,
        builder: (_, _) => const AccountGateScreen.suspended(),
      ),
      GoRoute(
        path: AppRoutes.onboardingIncomplete,
        builder: (_, _) => const AccountGateScreen.incompleteOnboarding(),
      ),
      GoRoute(
        path: '/w/:workspace/:section',
        builder: (_, state) {
          final section = state.pathParameters['section']!;
          return switch (Workspace.fromKey(state.pathParameters['workspace']!)) {
            Workspace.customer => CustomerDashboard(sectionKey: section),
            Workspace.vendor => VendorDashboard(sectionKey: section),
            Workspace.driver => DriverDashboard(sectionKey: section),
            Workspace.admin => AdminDashboard(sectionKey: section),
            null => const SizedBox.shrink(),
          };
        },
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});

