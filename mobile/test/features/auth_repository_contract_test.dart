import 'package:dio/dio.dart';
import 'package:dodo_universe/core/api/api_client.dart';
import 'package:dodo_universe/core/errors/app_exception.dart';
import 'package:dodo_universe/features/authentication/data/auth_repository.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

void main() {
  group('AuthRepository verifyOtp response contract', () {
    test('parses nested user and tokens from real backend response contract', () async {
      final backendResponse = {
        'user': {
          'id': '7b8d1bfa-1234-5678-9abc-def012345678',
          'supabase_uid': 'phone_7b8d1bfa_1730712345',
          'phone': '+916302803606',
          'full_name': 'Yamini Saraswathi',
          'email': 'yamini@example.com',
          'role': 'USER',
          'status': 'OTP_VERIFIED',
          'mobile_verified': true,
        },
        'id': '7b8d1bfa-1234-5678-9abc-def012345678',
        'phone': '+916302803606',
        'access_token': 'jwt-access-token-xyz',
        'refresh_token': 'jwt-refresh-token-xyz',
        'token_type': 'Bearer',
        'expires_in': 900,
        'refresh_expires_in': 2592000,
      };

      final adapter = FakeHttpAdapter((_) => jsonResponse(okEnvelope(backendResponse)));
      final client = ApiClient(
        baseUrl: 'http://localhost:8080/api/v1',
        tokenReader: () async => null,
        dio: Dio()..httpClientAdapter = adapter,
      );
      final repo = AuthRepository(client);

      final session = await repo.verifyOtp(phone: '+916302803606', otpCode: '123456');

      expect(session.user.id, '7b8d1bfa-1234-5678-9abc-def012345678');
      expect(session.user.fullName, 'Yamini Saraswathi');
      expect(session.user.phone, '+916302803606');
      expect(session.user.email, 'yamini@example.com');
      expect(session.user.role, 'USER');
      expect(session.user.status, 'OTP_VERIFIED');
      expect(session.user.mobileVerified, isTrue);
      expect(session.tokens.accessToken, 'jwt-access-token-xyz');
      expect(session.tokens.refreshToken, 'jwt-refresh-token-xyz');
      expect(session.tokens.accessExpiresAt, isNotNull);
    });

    test('parses flattened user fields on data for backward compatibility', () async {
      final flattenedResponse = {
        'id': 'user-flat-99',
        'full_name': 'Flat User',
        'phone': '+919999999999',
        'role': 'USER',
        'status': 'ACTIVE',
        'access_token': 'access-token-flat',
        'refresh_token': 'refresh-token-flat',
        'expires_in': 3600,
      };

      final adapter = FakeHttpAdapter((_) => jsonResponse(okEnvelope(flattenedResponse)));
      final client = ApiClient(
        baseUrl: 'http://localhost:8080/api/v1',
        tokenReader: () async => null,
        dio: Dio()..httpClientAdapter = adapter,
      );
      final repo = AuthRepository(client);

      final session = await repo.verifyOtp(phone: '+919999999999', otpCode: '654321');

      expect(session.user.id, 'user-flat-99');
      expect(session.user.fullName, 'Flat User');
      expect(session.user.phone, '+919999999999');
      expect(session.tokens.accessToken, 'access-token-flat');
      expect(session.tokens.refreshToken, 'refresh-token-flat');
    });

    test('throws UnexpectedResponseException when user identity is missing', () async {
      final badResponse = {
        'access_token': 'token-only',
        'refresh_token': 'refresh-only',
      };

      final adapter = FakeHttpAdapter((_) => jsonResponse(okEnvelope(badResponse)));
      final client = ApiClient(
        baseUrl: 'http://localhost:8080/api/v1',
        tokenReader: () async => null,
        dio: Dio()..httpClientAdapter = adapter,
      );
      final repo = AuthRepository(client);

      expect(
        () => repo.verifyOtp(phone: '+910000000000', otpCode: '111111'),
        throwsA(isA<UnexpectedResponseException>().having(
          (e) => e.message,
          'message',
          contains('The server did not return an account identity.'),
        )),
      );
    });

    test('throws UnexpectedResponseException when tokens are missing', () async {
      final badResponse = {
        'user': {
          'id': 'uid-1',
          'full_name': 'No Token User',
          'role': 'USER',
        },
      };

      final adapter = FakeHttpAdapter((_) => jsonResponse(okEnvelope(badResponse)));
      final client = ApiClient(
        baseUrl: 'http://localhost:8080/api/v1',
        tokenReader: () async => null,
        dio: Dio()..httpClientAdapter = adapter,
      );
      final repo = AuthRepository(client);

      expect(
        () => repo.verifyOtp(phone: '+910000000000', otpCode: '222222'),
        throwsA(isA<UnexpectedResponseException>().having(
          (e) => e.message,
          'message',
          contains('The server did not return valid authentication tokens.'),
        )),
      );
    });
  });
}

