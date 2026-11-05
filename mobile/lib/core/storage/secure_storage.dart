import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Minimal key/value contract over the platform secure store. Exists so the
/// session logic can be tested without platform channels.
abstract interface class SecureKeyValueStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// Keychain (iOS) / Android Keystore backed implementation.
class PlatformSecureKeyValueStore implements SecureKeyValueStore {
  const PlatformSecureKeyValueStore([
    this._storage = const FlutterSecureStorage(),
  ]);

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// The signed access/refresh token pair issued by the backend.
class SessionTokens {
  const SessionTokens({
    required this.accessToken,
    required this.refreshToken,
    this.accessExpiresAt,
  });

  final String accessToken;
  final String refreshToken;

  /// When the access token expires (UTC), if the backend told us.
  final DateTime? accessExpiresAt;

  /// `true` when the access token's expiry timestamp is already in the past.
  bool isAccessExpired(DateTime now) {
    final expiry = accessExpiresAt;
    return expiry != null && !now.isBefore(expiry);
  }
}

/// Persists the session tokens in the platform secure store.
///
/// Stored: access token, refresh token and the access-token expiry timestamp
/// (all under the `dodo.` prefix). Passwords do not exist in this system and
/// the user profile is re-fetched from the backend on restore, never cached.
/// Everything is deleted on sign-out.
class SessionStorage {
  const SessionStorage(this._store);

  final SecureKeyValueStore _store;

  static const accessTokenKey = 'dodo.access_token';
  static const refreshTokenKey = 'dodo.refresh_token';
  static const accessExpiresAtKey = 'dodo.access_expires_at';

  /// Key used by the pre-token build (raw user id as bearer). Never read as a
  /// credential any more; only deleted so old installs do not keep it.
  static const legacyCredentialKey = 'dodo.session_credential';

  static const _allKeys = [
    accessTokenKey,
    refreshTokenKey,
    accessExpiresAtKey,
    legacyCredentialKey,
  ];

  /// The stored token pair, or `null` when signed out or incomplete.
  Future<SessionTokens?> readTokens() async {
    final access = await _store.read(accessTokenKey);
    final refresh = await _store.read(refreshTokenKey);
    if (access == null || access.isEmpty || refresh == null || refresh.isEmpty) {
      return null;
    }
    final rawExpiry = await _store.read(accessExpiresAtKey);
    final expiry = rawExpiry == null ? null : DateTime.tryParse(rawExpiry);
    return SessionTokens(
      accessToken: access,
      refreshToken: refresh,
      accessExpiresAt: expiry?.toUtc(),
    );
  }

  Future<void> writeTokens(SessionTokens tokens) async {
    await _store.write(refreshTokenKey, tokens.refreshToken);
    await _store.write(accessTokenKey, tokens.accessToken);
    final expiry = tokens.accessExpiresAt;
    if (expiry != null) {
      await _store.write(accessExpiresAtKey, expiry.toUtc().toIso8601String());
    } else {
      await _store.delete(accessExpiresAtKey);
    }
  }

  /// Deletes every stored session value.
  Future<void> clear() async {
    for (final key in _allKeys) {
      await _store.delete(key);
    }
  }
}
