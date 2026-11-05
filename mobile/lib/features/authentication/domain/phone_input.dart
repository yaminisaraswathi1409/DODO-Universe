/// Client-side phone input handling. The backend remains authoritative: it
/// normalises and validates the number again (`ValidateAndNormalizePhone`).
abstract final class PhoneInput {
  static final _nationalIndia = RegExp(r'^\d{10}$');
  static final _international = RegExp(r'^\+\d{8,15}$');

  static String _compact(String value) =>
      value.replaceAll(RegExp(r'[\s\-()]'), '');

  /// Returns an error message, or `null` when [value] looks valid.
  static String? validate(String? value) {
    final compact = _compact(value ?? '');
    if (compact.isEmpty) return 'Enter your mobile number';
    if (_nationalIndia.hasMatch(compact) || _international.hasMatch(compact)) {
      return null;
    }
    return 'Enter a 10-digit mobile number, or include the +country code';
  }

  /// Formats a valid [value] for the API: 10 digits become `+91XXXXXXXXXX`.
  static String normalize(String value) {
    final compact = _compact(value);
    return _nationalIndia.hasMatch(compact) ? '+91$compact' : compact;
  }
}

