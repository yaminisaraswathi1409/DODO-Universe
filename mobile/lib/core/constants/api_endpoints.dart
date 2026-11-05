/// Endpoints of the existing DODO Universe Go backend that the mobile app
/// uses in Phase 1. Paths are relative to `AppConfig.apiBaseUrl` (`/api/v1`).
///
/// Only endpoints that exist in `backend/cmd/api/main.go` are listed here. See
/// `mobile/docs/PHASE1_BACKEND_API_INVENTORY.md` for the full inventory and
/// the documented gaps.
abstract final class ApiEndpoints {
  /// POST `{phone}` – generates a login OTP. Public. Responds
  /// `{otp_sent, expires_in}`; errors 429 (Retry-After), 503 (SMS gateway), 400.
  static const requestOtp = '/auth/request-otp';

  /// POST `{full_name, phone, email}` – creates an account and an OTP. Public.
  /// HTTP 201, same data shape as [requestOtp] (no user).
  static const signup = '/auth/signup';

  /// POST `{phone, otp_code}` – verifies the 6-digit OTP. Public. Returns
  /// `{user, access_token, refresh_token, token_type, expires_in,
  /// refresh_expires_in}`.
  static const verifyOtp = '/users/verify-otp';

  /// POST `{refresh_token}` – renews the token pair. Called without a Bearer
  /// header. 401 = invalid/expired refresh token, 403 = suspended account.
  static const refresh = '/auth/refresh';

  /// GET – current user (fields at top level plus `driver_profile`) for the
  /// access token. Also works for suspended accounts.
  static const currentUser = '/users/me';

  /// GET `?user_id=` – skills/assets/services registered by a user.
  static const userServices = '/users/services';

  /// POST `{avatar_url, bio, address_text, aadhaar_number, lat, lng}` – completes profile. Authenticated.
  static const completeProfile = '/users/complete-profile';

  /// POST `{face_verification_ref}` – biometric face verification. Authenticated.
  static const verifyFace = '/users/verify-face';

  /// POST multipart form with `file` and optional `purpose` – uploads a file. Authenticated.
  static const upload = '/upload';

  /// GET – onboarding status checklist. Authenticated.
  static const onboardingStatus = '/users/onboarding-status';
}

