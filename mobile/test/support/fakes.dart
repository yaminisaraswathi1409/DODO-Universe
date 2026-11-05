import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:dodo_universe/core/errors/app_exception.dart';
import 'package:dodo_universe/core/storage/secure_storage.dart';
import 'package:dodo_universe/features/authentication/application/auth_controller.dart';
import 'package:dodo_universe/features/authentication/data/auth_repository.dart';
import 'package:dodo_universe/features/authentication/domain/auth_models.dart';

/// In-memory stand-in for the platform secure store (tests only).
class InMemorySecureKeyValueStore implements SecureKeyValueStore {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}

/// Scriptable repository used instead of the network in controller/widget tests.
class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({
    this.currentUser,
    this.services = const [],
    this.currentUserError,
    this.servicesError,
    this.verifySession,
    this.requestOtpError,
  });

  AppUser? currentUser;
  List<ServiceAsset> services;
  AppException? currentUserError;
  AppException? servicesError;
  AuthSession? verifySession;
  AppException? requestOtpError;

  final List<String> requestedOtpPhones = [];
  final List<String> signupPhones = [];

  @override
  Future<void> requestOtp(String phone) async {
    requestedOtpPhones.add(phone);
    if (requestOtpError != null) throw requestOtpError!;
  }

  @override
  Future<void> signup({
    required String fullName,
    required String phone,
    String? email,
  }) async {
    signupPhones.add(phone);
  }

  @override
  Future<AuthSession> verifyOtp({
    required String phone,
    required String otpCode,
  }) async {
    final session = verifySession;
    if (session == null) throw const ServerException('OTP verification failed');
    return session;
  }

  @override
  Future<AuthSession> refresh(String refreshToken) async {
    final session = verifySession;
    if (session == null) throw const UnauthorizedException();
    return session;
  }

  @override
  Future<AppUser> fetchCurrentUser() async {
    if (currentUserError != null) throw currentUserError!;
    return currentUser!;
  }

  @override
  Future<List<ServiceAsset>> fetchServices(String userId) async {
    if (servicesError != null) throw servicesError!;
    return services;
  }

  AppUser? completeProfileUser;
  AppUser? verifyFaceUser;
  String uploadImageUrl = 'http://localhost:8080/uploads/test.jpg';

  @override
  Future<AppUser> completeProfile({
    required String avatarUrl,
    String? bio,
    String? addressText,
    String? aadhaarNumber,
    double? lat,
    double? lng,
  }) async {
    return completeProfileUser ??
        (currentUser ?? testUser(status: 'PROFILE_COMPLETED'));
  }

  @override
  Future<AppUser> verifyFace({required String faceVerificationRef}) async {
    return verifyFaceUser ??
        (currentUser ?? testUser(status: 'ACTIVE'));
  }

  @override
  Future<String> uploadImage(String filePath, {String purpose = 'public_image'}) async {
    return uploadImageUrl;
  }

  @override
  Future<String> uploadImageBytes(Uint8List bytes, String filename, {String purpose = 'public_image'}) async {
    return uploadImageUrl;
  }

  @override
  Future<Map<String, dynamic>> fetchOnboardingStatus() async {
    return {
      'user_id': currentUser?.id ?? 'user-1',
      'status': currentUser?.status ?? 'ACTIVE',
      'mobile_verified': true,
      'profile_photo': true,
      'face_verified': true,
      'is_active': true,
    };
  }
}

/// Auth controller pinned to a fixed state for UI tests.
class FixedAuthController extends AuthController {
  FixedAuthController(this._fixed);

  final AuthState _fixed;

  @override
  AuthState build() => _fixed;
}

/// Dio adapter that answers from a callback and records requests.
class FakeHttpAdapter implements HttpClientAdapter {
  FakeHttpAdapter(this.handler);

  final ResponseBody Function(RequestOptions options) handler;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody jsonResponse(Map<String, dynamic> body, {int status = 200}) {
  return ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
}

/// Backend-style success envelope.
Map<String, dynamic> okEnvelope(Object? data, {String message = 'ok'}) => {
      'success': true,
      'code': 200,
      'message': message,
      'data': data,
    };

/// Backend-style error envelope.
Map<String, dynamic> errorEnvelope(int code, String message, {Object? error}) => {
      'success': false,
      'code': code,
      'message': message,
      'error': ?error,
    };

/// Test fixture user. Values are synthetic, not platform data.
AppUser testUser({
  String role = 'USER',
  String status = 'ACTIVE',
  bool suspended = false,
  String name = 'Test User',
  String? driverProfileStatus,
  String? avatarUrl,
  String? addressText,
  String? aadhaarNumber,
  bool faceVerified = false,
}) =>
    AppUser(
      id: 'user-id-1',
      fullName: name,
      status: status,
      role: role,
      phone: '+910000000000',
      avatarUrl: avatarUrl,
      addressText: addressText,
      aadhaarNumber: aadhaarNumber,
      faceVerified: faceVerified,
      isSuspendedFlag: suspended,
      driverProfileStatus: driverProfileStatus,
    );

Map<String, dynamic> userJson({String role = 'USER', String status = 'ACTIVE'}) => {
      'id': 'user-id-1',
      'supabase_uid': 'uid-1',
      'full_name': 'Test User',
      'phone': '+910000000000',
      'status': status,
      'role': role,
      'otp_code': '999999',
      'aadhaar_number': 'should-not-be-modelled',
    };

Authenticated authed(
  AppUser user, {
  List<ServiceAsset> services = const [],
}) =>
    Authenticated(
      user: user,
      capabilities: UserCapabilities.derive(user, services),
    );

ServiceAsset service(String type, {String status = 'APPROVED'}) =>
    ServiceAsset(id: 's-$type', assetType: type, title: type, status: status);
