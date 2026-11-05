import 'app_exception.dart';

/// Converts any thrown object into text that is safe to show to the user.
String describeError(Object error) {
  if (error is ServerException) {
    final details = error.details;
    if (details != null && details.isNotEmpty && details.length <= 160) {
      return '${error.message}: $details';
    }
    return error.message;
  }
  if (error is AppException) return error.message;
  return 'Something went wrong. Please try again.';
}

