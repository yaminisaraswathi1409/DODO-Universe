import 'package:dio/dio.dart';
import 'package:dodo_universe/core/api/api_providers.dart';
import 'package:dodo_universe/core/config/app_config.dart';
import 'package:dodo_universe/core/errors/app_exception.dart';
import 'package:dodo_universe/core/storage/secure_storage.dart';
import 'package:dodo_universe/features/authentication/application/auth_controller.dart';
import 'package:dodo_universe/features/authentication/domain/auth_models.dart';
import 'package:dodo_universe/shared/models/workspace.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

Future<AuthState> settled(ProviderContainer container) async {
  for (var i = 0; i < 200; i++) {
    final state = container.read(authControllerProvider);
    if (state is! AuthRestoring) return state;
    await Future<void>.delayed(Duration.zero);
  }
  fail('auth state never left AuthRestoring');
}

ProviderContainer containerWith(
  InMemorySecureKeyValueStore store,
  FakeAuthRepository repo,
) {
  final container = ProviderContainer(
    overrides: [
      secureStoreProvider.overrideWithValue(store),
      authRepositoryProvider.overrideWithValue(repo),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('AuthController', () {
    late InMemorySecureKeyValueStore store;

    setUp(() => store = InMemorySecureKeyValueStore());

    test('starts in AuthRestoring', () {
      final container = containerWith(store, FakeAuthRepository());
      expect(container.read(authControllerProvider), isA<AuthRestoring>());
    });

    test('no stored credential -> Unauthenticated', () async {
      final container = containerWith(store, FakeAuthRepository());
      expect(await settled(container), isA<Unauthenticated>());
    });

    test('valid stored credential restores the session from the backend', () async {
      store.values[SessionStorage.accessTokenKey] = 'access-1';
      store.values[SessionStorage.refreshTokenKey] = 'refresh-1';
      final repo = FakeAuthRepository(currentUser: testUser());
      final state = await settled(containerWith(store, repo));

      expect(state, isA<Authenticated>());
      final auth = state as Authenticated;
      expect(auth.user.fullName, 'Test User');
      expect(auth.capabilities.workspaces, [Workspace.customer]);
    });

    test('credential unknown to the backend (404) is cleared', () async {
      store.values[SessionStorage.accessTokenKey] = 'stale-access';
      store.values[SessionStorage.refreshTokenKey] = 'stale-refresh';
      final repo = FakeAuthRepository(currentUserError: const NotFoundException());
      final state = await settled(containerWith(store, repo));

      expect(state, isA<Unauthenticated>());
      expect((state as Unauthenticated).notice, contains('expired'));
      expect(store.values, isEmpty);
    });

    test('rejected credential (401) is cleared', () async {
      store.values[SessionStorage.accessTokenKey] = 'stale-access';
      store.values[SessionStorage.refreshTokenKey] = 'stale-refresh';
      final repo = FakeAuthRepository(currentUserError: const UnauthorizedException());
      final state = await settled(containerWith(store, repo));

      expect(state, isA<Unauthenticated>());
      expect(store.values, isEmpty);
    });

    test('network failure during restore keeps the credential but does not enter the app', () async {
      store.values[SessionStorage.accessTokenKey] = 'access-1';
      store.values[SessionStorage.refreshTokenKey] = 'refresh-1';
      final repo = FakeAuthRepository(currentUserError: const NetworkException());
      final state = await settled(containerWith(store, repo));

      expect(state, isA<Unauthenticated>());
      expect(store.values[SessionStorage.accessTokenKey], 'access-1');
      expect(store.values[SessionStorage.refreshTokenKey], 'refresh-1');
    });

    test('completeLogin stores the credential and enters the session', () async {
      final repo = FakeAuthRepository(currentUser: testUser());
      final container = containerWith(store, repo);
      await settled(container);

      await container.read(authControllerProvider.notifier).completeLogin(
            AuthSession(
              user: testUser(),
              tokens: const SessionTokens(accessToken: 'access-1', refreshToken: 'refresh-1'),
            ),
          );

      expect(container.read(authControllerProvider), isA<Authenticated>());
      expect(store.values[SessionStorage.accessTokenKey], 'access-1');
      expect(store.values[SessionStorage.refreshTokenKey], 'refresh-1');
    });

    test('completeLogin rolls back the credential if the backend rejects it', () async {
      final repo = FakeAuthRepository(currentUserError: const NotFoundException());
      final container = containerWith(store, repo);
      await settled(container);

      await expectLater(
        container.read(authControllerProvider.notifier).completeLogin(
              AuthSession(
                user: testUser(),
                tokens: const SessionTokens(accessToken: 'access-1', refreshToken: 'refresh-1'),
              ),
            ),
        throwsA(isA<NotFoundException>()),
      );
      expect(container.read(authControllerProvider), isA<Unauthenticated>());
      expect(store.values, isEmpty);
    });

    test('logout clears the stored credential', () async {
      store.values[SessionStorage.accessTokenKey] = 'access-1';
      store.values[SessionStorage.refreshTokenKey] = 'refresh-1';
      final container =
          containerWith(store, FakeAuthRepository(currentUser: testUser()));
      await settled(container);

      await container.read(authControllerProvider.notifier).logout();

      expect(container.read(authControllerProvider), isA<Unauthenticated>());
      expect(store.values, isEmpty);
    });

    test('failed services lookup falls back to customer-only and flags it', () async {
      store.values[SessionStorage.accessTokenKey] = 'access-1';
      store.values[SessionStorage.refreshTokenKey] = 'refresh-1';
      final repo = FakeAuthRepository(
        currentUser: testUser(),
        servicesError: const NetworkException(),
      );
      final auth = await settled(containerWith(store, repo)) as Authenticated;

      expect(auth.capabilitiesVerified, isFalse);
      expect(auth.capabilities.workspaces, [Workspace.customer]);
    });

    test('approved services unlock the vendor workspace', () async {
      store.values[SessionStorage.accessTokenKey] = 'access-1';
      store.values[SessionStorage.refreshTokenKey] = 'refresh-1';
      final repo = FakeAuthRepository(
        currentUser: testUser(),
        services: const [
          ServiceAsset(id: 's1', assetType: 'ELECTRICIAN', title: 't', status: 'APPROVED'),
        ],
      );
      final auth = await settled(containerWith(store, repo)) as Authenticated;

      expect(auth.capabilities.workspaces, [Workspace.customer, Workspace.vendor]);
    });
  });

  group('Unauthorized-session handling (API client -> auth controller)', () {
    test('a 401 on an authenticated call signs the user out and clears storage', () async {
      final store = InMemorySecureKeyValueStore()
        ..values[SessionStorage.accessTokenKey] = 'access-1'
        ..values[SessionStorage.refreshTokenKey] = 'refresh-1';

      var meCalls = 0;
      final adapter = FakeHttpAdapter((options) {
        if (options.path == '/users/me') {
          meCalls++;
          // First call (restore) succeeds, later calls are rejected.
          return meCalls == 1
              ? jsonResponse(okEnvelope(userJson()))
              : jsonResponse(errorEnvelope(401, 'Invalid or expired token'), status: 401);
        }
        return jsonResponse(okEnvelope(<Object>[]));
      });
      final dio = Dio()..httpClientAdapter = adapter;

      final container = ProviderContainer(
        overrides: [
          secureStoreProvider.overrideWithValue(store),
          appConfigProvider.overrideWithValue(
            const AppConfig(
              environment: AppEnvironment.development,
              apiBaseUrl: 'http://10.0.2.2:8080/api/v1',
            ),
          ),
          dioProvider.overrideWithValue(dio),
        ],
      );
      addTearDown(container.dispose);

      expect(await settled(container), isA<Authenticated>());

      await expectLater(
        container.read(apiClientProvider).get('/users/me'),
        throwsA(isA<UnauthorizedException>()),
      );
      await Future<void>.delayed(Duration.zero);

      final state = container.read(authControllerProvider);
      expect(state, isA<Unauthenticated>());
      expect((state as Unauthenticated).notice, contains('expired'));
      expect(store.values, isEmpty);
    });
  });
}
