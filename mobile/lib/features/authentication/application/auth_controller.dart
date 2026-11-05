import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_providers.dart';
import '../../../core/errors/app_exception.dart';
import '../data/auth_repository.dart';
import '../domain/auth_models.dart';

final Provider<AuthRepository> authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(apiClientProvider)),
);

/// Authentication state of the app.
sealed class AuthState {
  const AuthState();
}

/// Reading the stored credential and validating it with the backend.
final class AuthRestoring extends AuthState {
  const AuthRestoring();
}

final class Unauthenticated extends AuthState {
  const Unauthenticated({this.notice});

  /// Why the user was signed out (e.g. expired session), if relevant.
  final String? notice;
}

final class Authenticated extends AuthState {
  const Authenticated({
    required this.user,
    required this.capabilities,
    this.capabilitiesVerified = true,
  });

  final AppUser user;
  final UserCapabilities capabilities;

  /// `false` when the services lookup failed and the app fell back to the
  /// customer workspace only.
  final bool capabilitiesVerified;
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    Future.microtask(restore);
    return const AuthRestoring();
  }

  /// Restores a previous session by validating the stored credential with the
  /// backend (`GET /users/me`). No profile data is cached locally.
  Future<void> restore() async {
    final storage = ref.read(sessionStorageProvider);
    final tokens = await storage.readTokens();
    if (!ref.mounted) return;
    if (tokens == null) {
      state = const Unauthenticated();
      return;
    }
    try {
      final user = await ref.read(authRepositoryProvider).fetchCurrentUser();
      await _enter(user);
    } on UnauthorizedException {
      await _expireSession();
    } on NotFoundException {
      // The backend answers 404 for a credential that matches no account.
      await _expireSession();
    } on AppException catch (e) {
      if (!ref.mounted) return;
      // Cannot validate right now (offline/server error). Keep the stored
      // credential so a later attempt can restore it, but do not enter the app.
      state = Unauthenticated(notice: e.message);
    }
  }

  /// Completes sign-in after OTP verification. The tokens are stored first,
  /// then confirmed against the backend before the app enters the session.
  Future<void> completeLogin(AuthSession session) async {
    final storage = ref.read(sessionStorageProvider);
    await storage.writeTokens(session.tokens);
    try {
      final user = await ref.read(authRepositoryProvider).fetchCurrentUser();
      await _enter(user);
    } on AppException {
      await storage.clear();
      rethrow;
    }
  }

  /// Refreshes the user profile from the backend (`GET /users/me`) and
  /// updates the authenticated state.
  Future<AppUser> refreshUser() async {
    final user = await ref.read(authRepositoryProvider).fetchCurrentUser();
    await _enter(user);
    return user;
  }

  /// Directly updates the authenticated state with [user] and re-derives
  /// capabilities.
  Future<void> updateUser(AppUser user) async {
    await _enter(user);
  }

  Future<void> logout() async {
    // The backend exposes no logout/revoke endpoint, so sign-out is local.
    await ref.read(sessionStorageProvider).clear();
    if (!ref.mounted) return;
    state = const Unauthenticated();
  }

  /// Called by the API client when an authenticated request returns 401.
  Future<void> handleUnauthorized() async {
    if (state is! Authenticated) return;
    await _expireSession();
  }

  Future<void> _expireSession() async {
    await ref.read(sessionStorageProvider).clear();
    if (!ref.mounted) return;
    state = const Unauthenticated(
      notice: 'Your session has expired. Please sign in again.',
    );
  }

  Future<void> _enter(AppUser user) async {
    var capabilities = UserCapabilities.derive(user, const []);
    var verified = true;
    if (user.isActive && !user.isSuspended && !user.isAdmin) {
      try {
        final services =
            await ref.read(authRepositoryProvider).fetchServices(user.id);
        capabilities = UserCapabilities.derive(user, services);
      } on AppException {
        // Fall back to the least-privileged view; never guess higher access.
        capabilities = const UserCapabilities.customerOnly();
        verified = false;
      }
    }
    if (!ref.mounted) return;
    state = Authenticated(
      user: user,
      capabilities: capabilities,
      capabilitiesVerified: verified,
    );
  }
}

