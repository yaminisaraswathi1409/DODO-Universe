import 'package:dio/dio.dart';
import 'package:dodo_universe/core/api/api_client.dart';
import 'package:dodo_universe/core/errors/app_exception.dart';
import 'package:dodo_universe/core/storage/secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

ApiClient buildClient(
  FakeHttpAdapter adapter, {
  String? credential,
  SessionTokens? tokens,
  void Function()? onUnauthorized,
  List<String>? logs,
}) {
  final dio = Dio()..httpClientAdapter = adapter;
  final sessionTokens = tokens ??
      (credential != null
          ? SessionTokens(accessToken: credential, refreshToken: 'refresh-dummy')
          : null);
  return ApiClient(
    baseUrl: 'http://10.0.2.2:8080/api/v1',
    tokenReader: () async => sessionTokens,
    onUnauthorized: onUnauthorized,
    dio: dio,
    logSink: logs?.add,
  );
}

void main() {
  group('ApiClient', () {
    test('uses the configured base URL', () async {
      final adapter = FakeHttpAdapter((_) => jsonResponse(okEnvelope({})));
      final client = buildClient(adapter);
      await client.get('/users/me');
      expect(client.baseUrl, 'http://10.0.2.2:8080/api/v1');
      expect(adapter.requests.single.uri.toString(),
          'http://10.0.2.2:8080/api/v1/users/me');
    });

    test('sends the bearer credential for authenticated calls only', () async {
      final adapter = FakeHttpAdapter((_) => jsonResponse(okEnvelope({})));
      final client = buildClient(adapter, credential: 'cred-123');

      await client.get('/users/me');
      await client.post('/auth/request-otp', body: {'phone': '+911'}, authenticated: false);

      expect(adapter.requests[0].headers['Authorization'], 'Bearer cred-123');
      expect(adapter.requests[1].headers.containsKey('Authorization'), isFalse);
    });

    test('omits the Authorization header when signed out', () async {
      final adapter = FakeHttpAdapter((_) => jsonResponse(okEnvelope({})));
      await buildClient(adapter).get('/users/me');
      expect(adapter.requests.single.headers.containsKey('Authorization'), isFalse);
    });

    test('parses the backend response envelope', () async {
      final adapter = FakeHttpAdapter(
        (_) => jsonResponse(okEnvelope({'id': 'x'}, message: 'fetched')),
      );
      final envelope = await buildClient(adapter).get('/users/me');
      expect(envelope.success, isTrue);
      expect(envelope.message, 'fetched');
      expect(envelope.dataAsMap, {'id': 'x'});
    });

    test('maps 401 to UnauthorizedException and notifies the session owner', () async {
      var notified = 0;
      final adapter = FakeHttpAdapter(
        (_) => jsonResponse(errorEnvelope(401, 'Invalid or expired token'), status: 401),
      );
      final client = buildClient(adapter, credential: 'c', onUnauthorized: () => notified++);

      await expectLater(client.get('/users/me'), throwsA(isA<UnauthorizedException>()));
      expect(notified, 1);
    });

    test('401 from an unauthenticated call does not trigger session expiry', () async {
      var notified = 0;
      final adapter = FakeHttpAdapter(
        (_) => jsonResponse(errorEnvelope(401, 'nope'), status: 401),
      );
      final client = buildClient(adapter, onUnauthorized: () => notified++);

      await expectLater(
        client.post('/users/verify-otp', authenticated: false),
        throwsA(isA<UnauthorizedException>()),
      );
      expect(notified, 0);
    });

    test('maps 403, 404 and other statuses to typed exceptions', () async {
      final statuses = <int, Matcher>{
        403: isA<ForbiddenException>(),
        404: isA<NotFoundException>(),
        400: isA<ServerException>(),
        500: isA<ServerException>(),
      };
      for (final entry in statuses.entries) {
        final adapter = FakeHttpAdapter(
          (_) => jsonResponse(
            errorEnvelope(entry.key, 'failure ${entry.key}', error: 'detail'),
            status: entry.key,
          ),
        );
        await expectLater(buildClient(adapter).get('/x'), throwsA(entry.value));
      }
    });

    test('keeps backend message and detail on errors', () async {
      final adapter = FakeHttpAdapter(
        (_) => jsonResponse(
          errorEnvelope(400, 'OTP verification failed', error: 'invalid or expired OTP code'),
          status: 400,
        ),
      );
      try {
        await buildClient(adapter).post('/users/verify-otp', authenticated: false);
        fail('expected exception');
      } on ServerException catch (e) {
        expect(e.message, 'OTP verification failed');
        expect(e.details, 'invalid or expired OTP code');
        expect(e.statusCode, 400);
      }
    });

    test('maps timeouts to RequestTimeoutException', () async {
      final adapter = FakeHttpAdapter((options) => throw DioException.receiveTimeout(
            timeout: const Duration(seconds: 1),
            requestOptions: options,
          ));
      await expectLater(
        buildClient(adapter).get('/x'),
        throwsA(isA<RequestTimeoutException>()),
      );
    });

    test('maps connection failures to NetworkException', () async {
      final adapter = FakeHttpAdapter((options) => throw DioException.connectionError(
            requestOptions: options,
            reason: 'offline',
          ));
      await expectLater(buildClient(adapter).get('/x'), throwsA(isA<NetworkException>()));
    });

    test('rejects a 2xx response that is not a backend envelope', () async {
      final adapter = FakeHttpAdapter(
        (_) => ResponseBody.fromString('plain text', 200),
      );
      await expectLater(
        buildClient(adapter).get('/x'),
        throwsA(isA<UnexpectedResponseException>()),
      );
    });

    test('logs only method, path and status; never credentials, bodies or queries', () async {
      final logs = <String>[];
      final adapter = FakeHttpAdapter((_) => jsonResponse(okEnvelope({})));
      final client = buildClient(adapter, credential: 'SECRET-CREDENTIAL', logs: logs);

      await client.post(
        '/users/verify-otp',
        body: {'phone': '+910000000000', 'otp_code': '123456'},
      );
      await client.get('/users/services', query: {'user_id': 'abc'});

      final joined = logs.join('\n');
      expect(logs, hasLength(2));
      expect(joined, contains('POST /users/verify-otp -> 200'));
      expect(joined, isNot(contains('SECRET-CREDENTIAL')));
      expect(joined, isNot(contains('123456')));
      expect(joined, isNot(contains('+910000000000')));
      expect(joined, isNot(contains('user_id')));
      expect(joined, isNot(contains('Bearer')));
    });
  });
}

