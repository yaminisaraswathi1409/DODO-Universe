import 'package:dio/dio.dart';

import '../errors/app_exception.dart';
import '../storage/secure_storage.dart';
import 'api_envelope.dart';

/// Reads the stored access/refresh token pair, or `null` when signed out.
typedef SessionTokenReader = Future<SessionTokens?> Function();

/// Renews the session. Supplied by the auth layer (so the API client has no
/// dependency on it) and responsible for calling `POST /auth/refresh` and
/// persisting the new pair.
///
/// Returns the new access token, or `null` when the refresh token was rejected
/// (the session is over). Transient failures (network, timeout, 5xx) must be
/// thrown as an [AppException]; they do **not** end the session.
typedef TokenRefresher = Future<String?> Function();

/// Reusable HTTP client for the existing DODO Universe Go backend.
///
/// * Single configurable [baseUrl]; screens never build URLs.
/// * Adds `Authorization: Bearer <access token>` when `authenticated`.
/// * On HTTP 401 it renews the session **once** through [tokenRefresher] and
///   retries the original request once. Concurrent 401s (and proactive
///   refreshes) share a single in-flight refresh call (single-flight). If the
///   refresh or the retry is rejected, [onUnauthorized] is invoked and an
///   [UnauthorizedException] is thrown. HTTP 403 never triggers a refresh or a
///   sign-out.
/// * The access token is refreshed proactively only when its stored expiry
///   timestamp is already in the past.
/// * Parses the backend response envelope and maps failures to [AppException]
///   (including 429 with `Retry-After` and 503).
/// * Applies connect/send/receive timeouts.
/// * Logs only `METHOD path -> status (ms)`. Headers, query strings and bodies
///   (which can contain OTPs, tokens or documents) are never logged.
///
/// Request bodies must be re-sendable (JSON); a one-shot stream/`FormData`
/// body cannot be replayed after a refresh.
class ApiClient {
  ApiClient({
    required String baseUrl,
    required this.tokenReader,
    this.tokenRefresher,
    this.onUnauthorized,
    Dio? dio,
    this.logSink,
    DateTime Function()? clock,
    Duration connectTimeout = const Duration(seconds: 15),
    Duration sendTimeout = const Duration(seconds: 30),
    Duration receiveTimeout = const Duration(seconds: 30),
  })  : _dio = dio ?? Dio(),
        _clock = clock ?? DateTime.now {
    _dio.options
      ..baseUrl = baseUrl
      ..connectTimeout = connectTimeout
      ..sendTimeout = sendTimeout
      ..receiveTimeout = receiveTimeout
      ..responseType = ResponseType.json
      // Status codes are mapped manually into typed exceptions.
      ..validateStatus = ((_) => true)
      ..headers = {'Accept': 'application/json'};
  }

  final Dio _dio;
  final SessionTokenReader tokenReader;

  /// Renews the session on 401; `null` disables refresh-and-retry.
  final TokenRefresher? tokenRefresher;

  final DateTime Function() _clock;

  /// Receives safe one-line log messages; `null` disables logging.
  final void Function(String message)? logSink;

  /// Invoked when the session could not be renewed after a 401.
  final void Function()? onUnauthorized;

  Future<String?>? _refreshInFlight;

  String get baseUrl => _dio.options.baseUrl;

  Future<ApiEnvelope> get(
    String path, {
    Map<String, dynamic>? query,
    bool authenticated = true,
  }) =>
      send('GET', path, query: query, authenticated: authenticated);

  Future<ApiEnvelope> post(
    String path, {
    Object? body,
    bool authenticated = true,
  }) =>
      send('POST', path, body: body, authenticated: authenticated);

  Future<ApiEnvelope> send(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool authenticated = true,
  }) async {
    final token = authenticated ? await _accessTokenForRequest() : null;
    try {
      return await _attempt(method, path, body, query, token);
    } on UnauthorizedException {
      if (!authenticated) rethrow;

      final renewed = await _renewAfterUnauthorized(token);
      if (renewed == null) {
        onUnauthorized?.call();
        rethrow;
      }
      try {
        // Exactly one retry; a second 401 ends the session.
        return await _attempt(method, path, body, query, renewed);
      } on UnauthorizedException {
        onUnauthorized?.call();
        rethrow;
      }
    }
  }

  /// The access token to send, refreshing first only if its stored expiry
  /// timestamp is already in the past.
  Future<String?> _accessTokenForRequest() async {
    final tokens = await tokenReader();
    if (tokens == null) return null;
    if (tokens.isAccessExpired(_clock()) && tokenRefresher != null) {
      final fresh = await _refreshSingleFlight();
      if (fresh == null) {
        onUnauthorized?.call();
        throw const UnauthorizedException();
      }
      return fresh;
    }
    return tokens.accessToken;
  }

  /// A new access token after a 401 on [sentToken], or `null` if the session
  /// cannot be renewed.
  Future<String?> _renewAfterUnauthorized(String? sentToken) async {
    final current = await tokenReader();
    if (current != null &&
        current.accessToken.isNotEmpty &&
        current.accessToken != sentToken) {
      // Another request already renewed the session while this one was in
      // flight; just retry with the new token (no second refresh).
      return current.accessToken;
    }
    if (tokenRefresher == null) return null;
    return _refreshSingleFlight();
  }

  Future<String?> _refreshSingleFlight() {
    final existing = _refreshInFlight;
    if (existing != null) return existing;
    final refresher = tokenRefresher!;
    final future = Future<String?>.sync(refresher).whenComplete(() {
      _refreshInFlight = null;
    });
    _refreshInFlight = future;
    return future;
  }

  Future<ApiEnvelope> _attempt(
    String method,
    String path,
    Object? body,
    Map<String, dynamic>? query,
    String? token,
  ) async {
    final headers = <String, dynamic>{};
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }

    final stopwatch = Stopwatch()..start();
    try {
      final response = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(method: method, headers: headers),
      );
      _log('$method $path -> ${response.statusCode} (${stopwatch.elapsedMilliseconds}ms)');
      return _handle(response);
    } on DioException catch (e) {
      _log('$method $path -> ${e.type.name} (${stopwatch.elapsedMilliseconds}ms)');
      throw _mapDioException(e);
    }
  }

  ApiEnvelope _handle(Response<dynamic> response) {
    final status = response.statusCode ?? 0;
    final raw = response.data;
    final envelope = raw is Map<String, dynamic> ? ApiEnvelope.fromJson(raw) : null;

    if (status >= 200 && status < 300) {
      if (envelope == null) throw const UnexpectedResponseException();
      return envelope;
    }

    final message = (envelope != null && envelope.message.isNotEmpty)
        ? envelope.message
        : null;
    final details = envelope?.error is String ? envelope!.error as String : null;

    switch (status) {
      case 401:
        throw UnauthorizedException(
          message ?? 'Your session has expired. Please sign in again.',
          status,
          details,
        );
      case 403:
        throw ForbiddenException(
          message ?? 'You do not have permission to perform this action.',
          status,
          details,
        );
      case 404:
        throw NotFoundException(
          message ?? 'The requested item was not found.',
          status,
          details,
        );
      case 429:
        throw RateLimitedException.fromRetryAfter(
          _parseRetryAfter(response.headers.value('retry-after')),
        );
      case 503:
        throw ServiceUnavailableException(
          'The service is temporarily unavailable. Please try again in a few minutes.',
          status,
          details,
        );
      default:
        throw ServerException(
          message ?? 'Request failed (HTTP $status).',
          statusCode: status,
          details: details,
        );
    }
  }

  /// `Retry-After` as delta-seconds. HTTP-date values are not interpreted.
  static Duration? _parseRetryAfter(String? value) {
    if (value == null) return null;
    final seconds = int.tryParse(value.trim());
    if (seconds == null || seconds < 0) return null;
    return Duration(seconds: seconds);
  }

  AppException _mapDioException(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return const RequestTimeoutException();
      case DioExceptionType.connectionError:
      case DioExceptionType.badCertificate:
        return const NetworkException();
      case DioExceptionType.cancel:
        return const NetworkException('The request was cancelled.');
      case DioExceptionType.badResponse:
      case DioExceptionType.unknown:
        return const NetworkException();
    }
  }

  void _log(String message) => logSink?.call('[api] $message');
}
