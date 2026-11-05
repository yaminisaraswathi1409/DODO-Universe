/// Typed failures raised by the API layer. UI code shows [message] and never
/// needs to know about Dio or HTTP.
sealed class AppException implements Exception {
  const AppException(this.message, {this.statusCode, this.details});

  /// Safe, user-presentable description.
  final String message;
  final int? statusCode;

  /// Optional extra detail returned by the backend `error` field.
  final String? details;

  @override
  String toString() => '$runtimeType($statusCode): $message';
}

/// No connectivity, DNS failure, refused connection, TLS failure, etc.
final class NetworkException extends AppException {
  const NetworkException([
    super.message =
        'Cannot reach the server. Check your internet connection and try again.',
  ]);
}

/// Connect, send or receive timeout.
final class RequestTimeoutException extends AppException {
  const RequestTimeoutException([
    super.message = 'The server took too long to respond. Please try again.',
  ]);
}

/// HTTP 401. The access token is not accepted (and, for authenticated calls,
/// could not be renewed with the refresh token).
final class UnauthorizedException extends AppException {
  const UnauthorizedException([
    super.message = 'Your session has expired. Please sign in again.',
    int? statusCode = 401,
    String? details,
  ]) : super(statusCode: statusCode, details: details);
}

/// HTTP 403. Authenticated but not permitted by the backend.
final class ForbiddenException extends AppException {
  const ForbiddenException([
    super.message = 'You do not have permission to perform this action.',
    int? statusCode = 403,
    String? details,
  ]) : super(statusCode: statusCode, details: details);
}

/// HTTP 404.
final class NotFoundException extends AppException {
  const NotFoundException([
    super.message = 'The requested item was not found.',
    int? statusCode = 404,
    String? details,
  ]) : super(statusCode: statusCode, details: details);
}

/// HTTP 429. Too many requests / attempts (OTP rate limit or lockout).
///
/// [retryAfter] is taken from the `Retry-After` response header when present.
final class RateLimitedException extends AppException {
  const RateLimitedException(super.message, {this.retryAfter})
      : super(statusCode: 429);

  /// Builds the user-facing message, mentioning the wait time when known.
  factory RateLimitedException.fromRetryAfter(Duration? retryAfter) {
    final wait = (retryAfter != null && retryAfter > Duration.zero)
        ? retryAfter
        : null;
    final String message;
    if (wait == null) {
      message = 'Too many attempts. Please wait a few minutes and try again.';
    } else if (wait.inSeconds < 60) {
      final s = wait.inSeconds < 1 ? 1 : wait.inSeconds;
      message = 'Too many attempts. Please try again in $s '
          '${s == 1 ? 'second' : 'seconds'}.';
    } else {
      final m = (wait.inSeconds / 60).ceil();
      message = 'Too many attempts. Please try again in $m '
          '${m == 1 ? 'minute' : 'minutes'}.';
    }
    return RateLimitedException(message, retryAfter: retryAfter);
  }

  /// Wait requested by the backend, if it sent a `Retry-After` header.
  final Duration? retryAfter;
}

/// HTTP 503. The service (e.g. the SMS gateway) is temporarily unavailable.
final class ServiceUnavailableException extends AppException {
  const ServiceUnavailableException([
    super.message =
        'The service is temporarily unavailable. Please try again in a few minutes.',
    int? statusCode = 503,
    String? details,
  ]) : super(statusCode: statusCode, details: details);
}

/// Any other non-2xx response (validation errors, 5xx, ...).
final class ServerException extends AppException {
  const ServerException(super.message, {super.statusCode, super.details});
}

/// A 2xx response that does not follow the backend envelope or lacks data the
/// app depends on.
final class UnexpectedResponseException extends AppException {
  const UnexpectedResponseException([
    super.message = 'The server returned an unexpected response.',
  ]);
}

