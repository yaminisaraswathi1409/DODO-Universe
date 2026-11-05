/// The envelope used by every response of the DODO Go backend
/// (`backend/pkg/response/response.go`):
///
/// ```json
/// { "success": true, "code": 200, "message": "...", "data": {...}, "error": ..., "meta": ... }
/// ```
class ApiEnvelope {
  const ApiEnvelope({
    required this.success,
    required this.code,
    required this.message,
    this.data,
    this.error,
    this.meta,
  });

  final bool success;
  final int code;
  final String message;
  final Object? data;
  final Object? error;
  final Object? meta;

  factory ApiEnvelope.fromJson(Map<String, dynamic> json) {
    return ApiEnvelope(
      success: json['success'] == true,
      code: json['code'] is int ? json['code'] as int : 0,
      message: json['message'] is String ? json['message'] as String : '',
      data: json['data'],
      error: json['error'],
      meta: json['meta'],
    );
  }

  /// `data` as a JSON object, or `null` when the backend returned something else.
  Map<String, dynamic>? get dataAsMap {
    final value = data;
    return value is Map<String, dynamic> ? value : null;
  }

  /// `data` as a JSON array of objects (empty when absent).
  List<Map<String, dynamic>> get dataAsList {
    final value = data;
    if (value is! List) return const [];
    return value.whereType<Map<String, dynamic>>().toList(growable: false);
  }
}

