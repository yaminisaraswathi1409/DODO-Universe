import '../../../core/storage/secure_storage.dart';
import '../../../shared/models/workspace.dart';

String _string(Object? value) => value is String ? value : '';

/// The signed-in user as returned by the backend (`domain.User`).
///
/// `GET /users/me` returns the user fields at the top level plus
/// `driver_profile` (`null` or an object with `status`). The same user shape is
/// nested under `user` in the verify-otp and refresh responses.
///
/// Sensitive fields the backend may include (`otp_code`, `aadhaar_number`,
/// face verification reference, `supabase_uid`) are deliberately not modelled.
class AppUser {
  const AppUser({
    required this.id,
    required this.fullName,
    required this.status,
    required this.role,
    this.supabaseUid = '',
    this.phone,
    this.email,
    this.avatarUrl,
    this.bio,
    this.addressText,
    this.aadhaarNumber,
    this.isSuspendedFlag = false,
    this.suspensionReason,
    this.mobileVerified = false,
    this.faceVerified = false,
    this.isVerifiedFlag = false,
    this.driverProfileStatus,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) {
    final map = (json['user'] is Map)
        ? (json['user'] as Map).map((k, v) => MapEntry(k.toString(), v))
        : json;

    final driverProfile = map['driver_profile'];
    final id = _string(map['id']).isNotEmpty
        ? _string(map['id'])
        : _string(map['user_id']);

    return AppUser(
      id: id,
      fullName: _string(map['full_name']).isNotEmpty
          ? _string(map['full_name'])
          : _string(map['name']),
      supabaseUid: _string(map['supabase_uid']),
      driverProfileStatus:
          driverProfile is Map && driverProfile['status'] is String
              ? (driverProfile['status'] as String).toUpperCase()
              : null,
      status: _string(map['status']).isNotEmpty
          ? _string(map['status'])
          : 'OTP_VERIFIED',
      role: _string(map['role']).isEmpty ? 'USER' : _string(map['role']).toUpperCase(),
      phone: map['phone'] is String ? map['phone'] as String : null,
      email: map['email'] is String ? map['email'] as String : null,
      avatarUrl: map['avatar_url'] is String ? map['avatar_url'] as String : null,
      bio: map['bio'] is String ? map['bio'] as String : null,
      addressText: map['address_text'] is String ? map['address_text'] as String : null,
      aadhaarNumber: map['aadhaar_number'] is String ? map['aadhaar_number'] as String : null,
      isSuspendedFlag: map['is_suspended'] == true,
      suspensionReason: map['suspension_reason'] is String
          ? map['suspension_reason'] as String
          : null,
      mobileVerified: map['mobile_verified'] == true,
      faceVerified: map['face_verified'] == true,
      isVerifiedFlag: map['is_verified'] == true,
    );
  }

  final String id;
  final String fullName;
  final String supabaseUid;

  /// Backend `UserStatus`: PENDING, OTP_VERIFIED, PROFILE_COMPLETED, ACTIVE,
  /// SUSPENDED (the web client also handles DEACTIVATED).
  final String status;

  /// Backend `UserRole`: USER, ADMIN or SUPER_ADMIN.
  final String role;
  final String? phone;
  final String? email;
  final String? avatarUrl;
  final String? bio;
  final String? addressText;
  final String? aadhaarNumber;
  final bool isSuspendedFlag;
  final String? suspensionReason;
  final bool mobileVerified;
  final bool faceVerified;
  final bool isVerifiedFlag;

  /// `driver_profile.status` (`PENDING`, `APPROVED`, `SUSPENDED`, `REJECTED`),
  /// or `null` when the account has no driver profile.
  final String? driverProfileStatus;

  /// The backend's explicit driver identity: an approved driver profile.
  bool get isApprovedDriver => driverProfileStatus == 'APPROVED';

  bool get isActive => status == 'ACTIVE';

  bool get isProfileCompleted =>
      status == 'PROFILE_COMPLETED' ||
      status == 'ACTIVE' ||
      (avatarUrl != null && avatarUrl!.isNotEmpty);

  bool get isFaceVerified => faceVerified;

  bool get isSuspended =>
      isSuspendedFlag || status == 'SUSPENDED' || status == 'DEACTIVATED';

  bool get isAdmin => role == 'ADMIN' || role == 'SUPER_ADMIN';
}

/// A user registered skill/asset/service (`domain.UserSkillAsset`). Only the
/// fields needed to derive capabilities are modelled.
class ServiceAsset {
  const ServiceAsset({
    required this.id,
    required this.assetType,
    required this.title,
    required this.status,
  });

  factory ServiceAsset.fromJson(Map<String, dynamic> json) {
    return ServiceAsset(
      id: _string(json['id']),
      assetType: _string(json['asset_type']),
      title: _string(json['title']),
      status: _string(json['status']),
    );
  }

  final String id;
  final String assetType;
  final String title;

  /// `ServiceAssetStatus`: PENDING_APPROVAL, DOCUMENTS_PENDING, UNDER_REVIEW,
  /// VERIFICATION_PENDING, APPROVED, ACTIVE, REJECTED.
  final String status;

  bool get isApproved => status == 'APPROVED' || status == 'ACTIVE';
}

/// Result of a successful OTP verification or token refresh: the signed token
/// pair plus the user the backend returned with it.
class AuthSession {
  const AuthSession({required this.user, required this.tokens});

  final AppUser user;
  final SessionTokens tokens;
}

/// Which workspaces the backend data allows this user to open.
///
/// * Admin: `role` is `ADMIN` or `SUPER_ADMIN` (both are admins on every admin
///   endpoint).
/// * Driver: only when `/users/me` returns `driver_profile.status == APPROVED`.
///   Asset types are never inspected for this.
/// * Vendor: derived from approved services (`APPROVED`/`ACTIVE`); driver assets
///   are ordinary vendor assets.
/// * Customer: every active user.
///
/// This only selects navigation; the backend still authorises every API call.
class UserCapabilities {
  const UserCapabilities({
    required this.isAdmin,
    required this.isVendor,
    required this.isDriver,
  });

  const UserCapabilities.customerOnly()
      : isAdmin = false,
        isVendor = false,
        isDriver = false;

  factory UserCapabilities.derive(AppUser user, List<ServiceAsset> services) {
    return UserCapabilities(
      isAdmin: user.isAdmin,
      isVendor: services.any((s) => s.isApproved),
      isDriver: user.isApprovedDriver,
    );
  }

  final bool isAdmin;
  final bool isVendor;
  final bool isDriver;

  /// Workspaces available to the user. Admins get the admin workspace only,
  /// mirroring the web app which routes admins to the admin area.
  List<Workspace> get workspaces {
    if (isAdmin) return const [Workspace.admin];
    return [
      Workspace.customer,
      if (isVendor) Workspace.vendor,
      if (isDriver) Workspace.driver,
    ];
  }

  Workspace get defaultWorkspace => workspaces.first;
}

