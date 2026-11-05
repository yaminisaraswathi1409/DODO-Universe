import 'package:flutter/foundation.dart';

/// Deployment environment the app is running against.
enum AppEnvironment { development, production }

/// Thrown when the build-time configuration is unsafe or incomplete.
class AppConfigException implements Exception {
  const AppConfigException(this.message);
  final String message;

  @override
  String toString() => 'AppConfigException: $message';
}

/// Build-time configuration for the DODO Universe mobile app.
///
/// Values come from `--dart-define` so that no environment specific value or
/// secret is hard-coded in the source tree:
///
/// ```text
/// flutter run --dart-define=APP_ENV=development
/// flutter run --dart-define=API_BASE_URL=http://192.168.1.20:8080/api/v1
/// flutter build apk --release --dart-define=APP_ENV=production \
///     --dart-define=API_BASE_URL=https://api.example.com/api/v1
/// ```
class AppConfig {
  const AppConfig({required this.environment, required this.apiBaseUrl});

  final AppEnvironment environment;

  /// Base URL of the existing Go backend, including the `/api/v1` prefix and
  /// without a trailing slash.
  final String apiBaseUrl;

  bool get isProduction => environment == AppEnvironment.production;

  /// Android emulator alias for the host machine's loopback interface.
  /// `localhost` inside the emulator points at the emulator itself.
  static const androidEmulatorHostUrl = 'http://10.0.2.2:8080/api/v1';

  /// Default for iOS simulator, desktop and web development.
  static const localhostUrl = 'http://localhost:8080/api/v1';

  static const _envName = String.fromEnvironment('APP_ENV');
  static const _apiBaseUrl = String.fromEnvironment('API_BASE_URL');

  /// Reads configuration from the compile-time `--dart-define` values.
  factory AppConfig.fromEnvironment() {
    return AppConfig.resolve(
      envName: _envName,
      apiBaseUrlOverride: _apiBaseUrl,
      platform: defaultTargetPlatform,
      isReleaseMode: kReleaseMode,
    );
  }

  /// Pure resolution logic, separated from the compile-time constants so it can
  /// be unit tested.
  ///
  /// * An empty [envName] means `production` for release builds and
  ///   `development` otherwise, so a release build can never silently talk to a
  ///   development server.
  /// * Production requires an explicit `https://` [apiBaseUrlOverride].
  factory AppConfig.resolve({
    required String envName,
    required String apiBaseUrlOverride,
    required TargetPlatform platform,
    required bool isReleaseMode,
  }) {
    final normalizedName = envName.trim().toLowerCase();
    final AppEnvironment environment;
    switch (normalizedName) {
      case '':
        environment =
            isReleaseMode ? AppEnvironment.production : AppEnvironment.development;
      case 'development' || 'dev':
        environment = AppEnvironment.development;
      case 'production' || 'prod':
        environment = AppEnvironment.production;
      default:
        throw AppConfigException('Unknown APP_ENV "$envName".');
    }

    final override = _stripTrailingSlash(apiBaseUrlOverride.trim());

    if (environment == AppEnvironment.production) {
      if (override.isEmpty) {
        throw const AppConfigException(
          'API_BASE_URL must be provided with --dart-define for production builds.',
        );
      }
      if (!override.startsWith('https://')) {
        throw const AppConfigException(
          'Production API_BASE_URL must use https://.',
        );
      }
      return AppConfig(environment: environment, apiBaseUrl: override);
    }

    if (override.isNotEmpty) {
      return AppConfig(environment: environment, apiBaseUrl: override);
    }

    final defaultUrl = (!kIsWeb && platform == TargetPlatform.android)
        ? androidEmulatorHostUrl
        : localhostUrl;
    return AppConfig(environment: environment, apiBaseUrl: defaultUrl);
  }

  static String _stripTrailingSlash(String value) =>
      value.endsWith('/') ? value.substring(0, value.length - 1) : value;
}

