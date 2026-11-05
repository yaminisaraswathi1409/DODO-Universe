import 'package:dodo_universe/core/config/app_config.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

AppConfig resolve({
  String env = '',
  String url = '',
  TargetPlatform platform = TargetPlatform.android,
  bool release = false,
}) =>
    AppConfig.resolve(
      envName: env,
      apiBaseUrlOverride: url,
      platform: platform,
      isReleaseMode: release,
    );

void main() {
  group('AppConfig', () {
    test('Android emulator development uses 10.0.2.2, not localhost', () {
      final config = resolve(platform: TargetPlatform.android);
      expect(config.environment, AppEnvironment.development);
      expect(config.apiBaseUrl, 'http://10.0.2.2:8080/api/v1');
      expect(config.apiBaseUrl, isNot(contains('localhost')));
    });

    test('iOS simulator development uses localhost', () {
      final config = resolve(platform: TargetPlatform.iOS);
      expect(config.apiBaseUrl, 'http://localhost:8080/api/v1');
    });

    test('explicit API_BASE_URL overrides the default and drops trailing slash', () {
      final config = resolve(url: 'http://192.168.1.20:8080/api/v1/');
      expect(config.apiBaseUrl, 'http://192.168.1.20:8080/api/v1');
    });

    test('production requires an explicit https API_BASE_URL', () {
      expect(() => resolve(env: 'production'), throwsA(isA<AppConfigException>()));
      expect(
        () => resolve(env: 'production', url: 'http://api.example.com/api/v1'),
        throwsA(isA<AppConfigException>()),
      );
      final config = resolve(env: 'production', url: 'https://api.example.com/api/v1');
      expect(config.isProduction, isTrue);
      expect(config.apiBaseUrl, 'https://api.example.com/api/v1');
    });

    test('release build without APP_ENV defaults to production and fails safe', () {
      expect(() => resolve(release: true), throwsA(isA<AppConfigException>()));
    });

    test('debug build without APP_ENV defaults to development', () {
      expect(resolve().environment, AppEnvironment.development);
    });

    test('unknown APP_ENV is rejected', () {
      expect(() => resolve(env: 'staging'), throwsA(isA<AppConfigException>()));
    });
  });
}

