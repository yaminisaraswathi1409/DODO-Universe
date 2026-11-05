/// Integration boundaries for platform capabilities that are **not** wired up in
/// Phase 1. Each interface has a default implementation that reports
/// [IntegrationNotConfiguredException]; nothing here ever pretends to succeed.
///
/// What exists in the backend today (see the Phase 1 API inventory):
///
/// * Uploads: `POST /api/v1/upload` (multipart field `file`, JPG/PNG/WEBP/PDF/
///   MP4/WEBM/MOV, 50MB). Files are served from the public `/uploads/*` path,
///   so private KYC/prescription/identity documents must NOT be uploaded
///   through it until the backend offers private storage with access control.
/// * Notifications: `GET /api/v1/notifications`, `/unread-count`, `/read-all`,
///   `POST /{id}/read`, `GET|PUT /preferences`. There is no device-token
///   registration endpoint, so push delivery cannot be wired yet.
/// * Maps: the web app uses a browser-restricted Google Maps key
///   (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`). Mobile needs its own key restricted
///   to the Android package / iOS bundle id. No key is committed to this repo.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

class IntegrationNotConfiguredException implements Exception {
  const IntegrationNotConfiguredException(this.integration, this.reason);

  final String integration;
  final String reason;

  @override
  String toString() => '$integration is not configured: $reason';
}

class GeoPosition {
  const GeoPosition(this.latitude, this.longitude);
  final double latitude;
  final double longitude;
}

abstract interface class LocationService {
  bool get isConfigured;
  Future<GeoPosition> currentPosition();
}

class UnconfiguredLocationService implements LocationService {
  const UnconfiguredLocationService();

  @override
  bool get isConfigured => false;

  @override
  Future<GeoPosition> currentPosition() => Future.error(
        const IntegrationNotConfiguredException(
          'Location',
          'location permission handling and a maps key are added in a later phase.',
        ),
      );
}

enum UploadKind { profileImage, catalogPhoto, kycDocument, other }

abstract interface class FileUploadService {
  bool get isConfigured;

  /// Uploads a file and returns its URL as issued by the backend.
  Future<String> upload(String filePath, UploadKind kind);
}

class UnconfiguredFileUploadService implements FileUploadService {
  const UnconfiguredFileUploadService();

  @override
  bool get isConfigured => false;

  @override
  Future<String> upload(String filePath, UploadKind kind) => Future.error(
        IntegrationNotConfiguredException(
          'Upload (${kind.name})',
          kind == UploadKind.kycDocument
              ? 'the backend only offers public upload URLs; private KYC storage is a backend gap.'
              : 'upload UI and picker integration are added in a later phase.',
        ),
      );
}

abstract interface class PushNotificationService {
  bool get isConfigured;
  Future<void> requestPermission();
}

class UnconfiguredPushNotificationService implements PushNotificationService {
  const UnconfiguredPushNotificationService();

  @override
  bool get isConfigured => false;

  @override
  Future<void> requestPermission() => Future.error(
        const IntegrationNotConfiguredException(
          'Push notifications',
          'no Firebase project is configured and the backend has no device-token registration endpoint.',
        ),
      );
}

abstract interface class DeepLinkHandler {
  bool get isConfigured;
}

class UnconfiguredDeepLinkHandler implements DeepLinkHandler {
  const UnconfiguredDeepLinkHandler();

  @override
  bool get isConfigured => false;
}

final locationServiceProvider =
    Provider<LocationService>((ref) => const UnconfiguredLocationService());
final fileUploadServiceProvider =
    Provider<FileUploadService>((ref) => const UnconfiguredFileUploadService());
final pushNotificationServiceProvider = Provider<PushNotificationService>(
    (ref) => const UnconfiguredPushNotificationService());
final deepLinkHandlerProvider =
    Provider<DeepLinkHandler>((ref) => const UnconfiguredDeepLinkHandler());

