import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../config/app_config.dart';
import '../storage/secure_storage.dart';
import '../../features/authentication/application/auth_controller.dart';

/// Build-time configuration. Overridden in tests.
final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig.fromEnvironment(),
);

/// Platform secure store. Overridden in tests with an in-memory fake.
final secureStoreProvider = Provider<SecureKeyValueStore>(
  (ref) => const PlatformSecureKeyValueStore(),
);

final sessionStorageProvider = Provider<SessionStorage>(
  (ref) => SessionStorage(ref.watch(secureStoreProvider)),
);

/// Underlying HTTP client. Overridden in tests to inject a fake adapter.
final dioProvider = Provider<Dio>((ref) => Dio());

/// The single API client used by all features.
final Provider<ApiClient> apiClientProvider = Provider<ApiClient>((ref) {
  final config = ref.watch(appConfigProvider);
  final storage = ref.watch(sessionStorageProvider);
  return ApiClient(
    baseUrl: config.apiBaseUrl,
    dio: ref.watch(dioProvider),
    tokenReader: storage.readTokens,
    tokenRefresher: () async {
      final tokens = await storage.readTokens();
      if (tokens == null) return null;
      try {
        final res = await ref.read(dioProvider).post<Map<String, dynamic>>(
          '${config.apiBaseUrl}/auth/refresh',
          data: {'refresh_token': tokens.refreshToken},
          options: Options(
            responseType: ResponseType.json,
            validateStatus: (_) => true,
          ),
        );
        if (res.statusCode == 200 && res.data != null) {
          final data = res.data!['data'];
          if (data is Map<String, dynamic> && data['access_token'] is String) {
            final access = data['access_token'] as String;
            final refresh = (data['refresh_token'] as String?) ?? tokens.refreshToken;
            final expiresIn = data['expires_in'];
            final expiry = expiresIn is num
                ? DateTime.now().toUtc().add(Duration(seconds: expiresIn.toInt()))
                : null;
            await storage.writeTokens(SessionTokens(
              accessToken: access,
              refreshToken: refresh,
              accessExpiresAt: expiry,
            ));
            return access;
          }
        }
        if (res.statusCode == 401 || res.statusCode == 403) {
          await storage.clear();
          return null;
        }
        return null;
      } catch (_) {
        return null;
      }
    },
    // Read lazily to avoid a construction cycle with the auth controller.
    onUnauthorized: () =>
        ref.read(authControllerProvider.notifier).handleUnauthorized(),
    logSink: kReleaseMode ? null : debugPrint,
  );
});
