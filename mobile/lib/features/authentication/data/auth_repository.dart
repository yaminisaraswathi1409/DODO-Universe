import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/storage/secure_storage.dart';
import '../domain/auth_models.dart';

/// Talks to the backend authentication endpoints.
///
/// Authentication is phone + OTP (no passwords). `verify-otp` and
/// `/auth/refresh` return a signed access/refresh token pair plus the user.
/// `request-otp` and `signup` return only `{otp_sent, expires_in}` (and, on
/// development backends, a `dev_otp_code` which is never read, shown or
/// logged). See `mobile/docs/AUTH_CONTRACT.md`.
class AuthRepository {
  AuthRepository(this._api, {DateTime Function()? clock})
      : _clock = clock ?? DateTime.now;

  final ApiClient _api;
  final DateTime Function() _clock;

  static const _smsUnavailable = ServiceUnavailableException(
    'We could not send the verification code right now. '
    'Please try again in a few minutes.',
  );

  /// Requests a login OTP. The response body is ignored on purpose (including
  /// any development-only OTP echo).
  Future<void> requestOtp(String phone) async {
    try {
      await _api.post(
        ApiEndpoints.requestOtp,
        body: {'phone': phone},
        authenticated: false,
      );
    } on ServiceUnavailableException {
      throw _smsUnavailable;
    }
  }

  /// Creates an account and dispatches an OTP. The response body is ignored.
  Future<void> signup({
    required String fullName,
    required String phone,
    String? email,
  }) async {
    try {
      await _api.post(
        ApiEndpoints.signup,
        body: {
          'full_name': fullName,
          'phone': phone,
          if (email != null && email.isNotEmpty) 'email': email,
        },
        authenticated: false,
      );
    } on ServiceUnavailableException {
      throw _smsUnavailable;
    }
  }

  /// Verifies the 6-digit OTP and returns the signed tokens and the user.
  Future<AuthSession> verifyOtp({
    required String phone,
    required String otpCode,
  }) async {
    try {
      final envelope = await _api.post(
        ApiEndpoints.verifyOtp,
        body: {'phone': phone, 'otp_code': otpCode},
        authenticated: false,
      );
      return _parseSession(envelope.dataAsMap);
    } on ServerException catch (e) {
      if (e.statusCode == 400) {
        throw const ServerException(
          'That code is incorrect or has expired. Please request a new code.',
          statusCode: 400,
        );
      }
      rethrow;
    }
  }

  /// Exchanges [refreshToken] for a new token pair (`POST /auth/refresh`,
  /// unauthenticated). Throws [UnauthorizedException] when the refresh token is
  /// invalid or expired and [ForbiddenException] when the account is suspended.
  Future<AuthSession> refresh(String refreshToken) async {
    try {
      final envelope = await _api.post(
        ApiEndpoints.refresh,
        body: {'refresh_token': refreshToken},
        authenticated: false,
      );
      return _parseSession(envelope.dataAsMap);
    } on ForbiddenException {
      throw const ForbiddenException(
        'Your account is suspended. Please contact support.',
      );
    }
  }

  /// Profile for the current access token (`GET /users/me`). Also answers for
  /// suspended accounts.
  Future<AppUser> fetchCurrentUser() async {
    final envelope = await _api.get(ApiEndpoints.currentUser);
    final data = envelope.dataAsMap;
    if (data == null) throw const UnexpectedResponseException();
    return AppUser.fromJson(data);
  }

  Future<List<ServiceAsset>> fetchServices(String userId) async {
    final envelope = await _api.get(
      ApiEndpoints.userServices,
      query: {'user_id': userId},
    );
    return envelope.dataAsList.map(ServiceAsset.fromJson).toList();
  }

  /// Completes profile details (avatar_url, bio, address_text, aadhaar_number).
  Future<AppUser> completeProfile({
    required String avatarUrl,
    String? bio,
    String? addressText,
    String? aadhaarNumber,
    double? lat,
    double? lng,
  }) async {
    final envelope = await _api.post(
      ApiEndpoints.completeProfile,
      body: {
        'avatar_url': avatarUrl,
        if (bio != null && bio.isNotEmpty) 'bio': bio,
        if (addressText != null && addressText.isNotEmpty) 'address_text': addressText,
        if (aadhaarNumber != null && aadhaarNumber.isNotEmpty) 'aadhaar_number': aadhaarNumber,
        'lat': ?lat,
        'lng': ?lng,
      },
      authenticated: true,
    );
    final data = envelope.dataAsMap;
    if (data == null) {
      throw const UnexpectedResponseException('Failed to complete user profile');
    }
    return AppUser.fromJson(data);
  }

  /// Submits Face ID verification snapshot.
  Future<AppUser> verifyFace({required String faceVerificationRef}) async {
    final envelope = await _api.post(
      ApiEndpoints.verifyFace,
      body: {'face_verification_ref': faceVerificationRef},
      authenticated: true,
    );
    final data = envelope.dataAsMap;
    if (data == null) {
      throw const UnexpectedResponseException('Failed to process face verification');
    }
    return AppUser.fromJson(data);
  }

  /// Uploads a file from path to `POST /upload`. Returns the uploaded URL.
  Future<String> uploadImage(String filePath, {String purpose = 'public_image'}) async {
    final fileName = filePath.split(RegExp(r'[/\\]')).last;
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath, filename: fileName),
      if (purpose.isNotEmpty) 'purpose': purpose,
    });

    final envelope = await _api.send(
      'POST',
      ApiEndpoints.upload,
      body: formData,
      authenticated: true,
    );
    final data = envelope.dataAsMap;
    if (data == null || data['url'] is! String) {
      throw const UnexpectedResponseException('The server did not return an upload URL.');
    }
    return data['url'] as String;
  }

  /// Uploads image bytes to `POST /upload`. Returns the uploaded URL.
  Future<String> uploadImageBytes(Uint8List bytes, String filename, {String purpose = 'public_image'}) async {
    final formData = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes, filename: filename),
      if (purpose.isNotEmpty) 'purpose': purpose,
    });

    final envelope = await _api.send(
      'POST',
      ApiEndpoints.upload,
      body: formData,
      authenticated: true,
    );
    final data = envelope.dataAsMap;
    if (data == null || data['url'] is! String) {
      throw const UnexpectedResponseException('The server did not return an upload URL.');
    }
    return data['url'] as String;
  }

  /// Fetches onboarding checklist status.
  Future<Map<String, dynamic>> fetchOnboardingStatus() async {
    final envelope = await _api.get(ApiEndpoints.onboardingStatus);
    return envelope.dataAsMap ?? const {};
  }

  AuthSession _parseSession(Map<String, dynamic>? data) {
    if (data == null) {
      throw const UnexpectedResponseException(
        'The server did not return an account identity.',
      );
    }

    // Safely extract user map: either nested under 'user' or flattened at top-level
    Map<String, dynamic>? userMap;
    final rawUser = data['user'];
    if (rawUser is Map) {
      userMap = rawUser.map((k, v) => MapEntry(k.toString(), v));
    } else if (data['id'] != null ||
        data['user_id'] != null ||
        data['phone'] != null ||
        data['supabase_uid'] != null) {
      userMap = data;
    }

    if (userMap == null) {
      throw const UnexpectedResponseException(
        'The server did not return an account identity.',
      );
    }

    final user = AppUser.fromJson(userMap);
    if (user.id.isEmpty && user.supabaseUid.isEmpty && (user.phone == null || user.phone!.isEmpty)) {
      throw const UnexpectedResponseException(
        'The server did not return an account identity.',
      );
    }

    // Safely extract tokens
    final tokenMap = data['tokens'] is Map ? (data['tokens'] as Map) : null;
    final access = (data['access_token'] ??
            data['accessToken'] ??
            data['token'] ??
            tokenMap?['access_token'] ??
            tokenMap?['accessToken']) as String?;
    final refresh = (data['refresh_token'] ??
            data['refreshToken'] ??
            tokenMap?['refresh_token'] ??
            tokenMap?['refreshToken']) as String?;

    if (access == null || access.isEmpty || refresh == null || refresh.isEmpty) {
      throw const UnexpectedResponseException(
        'The server did not return valid authentication tokens.',
      );
    }

    final rawExpiresIn = data['expires_in'] ?? data['expiresIn'] ?? tokenMap?['expires_in'];
    final expiry = rawExpiresIn is num
        ? _clock().toUtc().add(Duration(seconds: rawExpiresIn.toInt()))
        : null;

    return AuthSession(
      user: user,
      tokens: SessionTokens(
        accessToken: access,
        refreshToken: refresh,
        accessExpiresAt: expiry,
      ),
    );
  }
}
