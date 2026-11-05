import 'package:dodo_universe/core/storage/secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

void main() {
  group('SessionStorage (secure storage abstraction)', () {
    late InMemorySecureKeyValueStore store;
    late SessionStorage storage;

    setUp(() {
      store = InMemorySecureKeyValueStore();
      storage = SessionStorage(store);
    });

    test('returns null when nothing is stored', () async {
      expect(await storage.readTokens(), isNull);
    });

    test('round-trips the tokens through the secure store', () async {
      const tokens = SessionTokens(
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
      );
      await storage.writeTokens(tokens);
      final read = await storage.readTokens();
      expect(read, isNotNull);
      expect(read!.accessToken, 'access-1');
      expect(read.refreshToken, 'refresh-1');
      expect(store.values[SessionStorage.accessTokenKey], 'access-1');
      expect(store.values[SessionStorage.refreshTokenKey], 'refresh-1');
    });

    test('clear removes all session keys', () async {
      const tokens = SessionTokens(
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
      );
      await storage.writeTokens(tokens);
      await storage.clear();
      expect(await storage.readTokens(), isNull);
      expect(store.values, isEmpty);
    });

    test('treats empty stored values as signed out', () async {
      store.values[SessionStorage.accessTokenKey] = '';
      store.values[SessionStorage.refreshTokenKey] = '';
      expect(await storage.readTokens(), isNull);
    });

    test('persists expiry timestamp when provided', () async {
      final expiry = DateTime.utc(2026, 12, 31, 23, 59, 59);
      final tokens = SessionTokens(
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        accessExpiresAt: expiry,
      );
      await storage.writeTokens(tokens);
      final read = await storage.readTokens();
      expect(read!.accessExpiresAt, expiry);
      expect(store.values[SessionStorage.accessExpiresAtKey], expiry.toIso8601String());
    });
  });
}

