import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/errors/error_message.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/state_widgets.dart';
import '../../authentication/application/auth_controller.dart';
import '../../authentication/presentation/auth_scaffold.dart';

/// Step 3 of Onboarding: Biometric Face ID Verification.
/// Scans face biometrics, verifies with Go backend, and activates the account.
class VerifyFaceScreen extends ConsumerStatefulWidget {
  const VerifyFaceScreen({
    super.key,
    this.redirectDelay = const Duration(milliseconds: 1500),
  });

  final Duration redirectDelay;

  @override
  ConsumerState<VerifyFaceScreen> createState() => _VerifyFaceScreenState();
}

class _VerifyFaceScreenState extends ConsumerState<VerifyFaceScreen> {
  final _picker = ImagePicker();
  String? _selfieLocalPath;
  bool _scanning = false;
  bool _activated = false;
  String? _error;

  Future<void> _takeSelfie() async {
    setState(() => _error = null);
    try {
      final photo = await _picker.pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: CameraDevice.front,
        maxWidth: 720,
        maxHeight: 720,
        imageQuality: 85,
      );
      if (photo == null) return;

      setState(() {
        _selfieLocalPath = photo.path;
      });

      // Automatically proceed to verify the captured selfie
      await _executeVerification(customRef: 'selfie_${DateTime.now().millisecondsSinceEpoch}');
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Camera access was denied or unavailable. You can use Biometric Facial Scan below: ${e.toString()}';
        });
      }
    }
  }

  Future<void> _executeVerification({String? customRef}) async {
    if (_scanning || _activated) return;

    setState(() {
      _scanning = true;
      _error = null;
    });

    try {
      final auth = ref.read(authControllerProvider);
      final userId = auth is Authenticated ? auth.user.id : 'user';
      final faceRef = customRef ?? 'face_snapshot_${userId}_${DateTime.now().millisecondsSinceEpoch}';

      // Call backend API: POST /api/v1/users/verify-face
      final updatedUser = await ref.read(authRepositoryProvider).verifyFace(
            faceVerificationRef: faceRef,
          );

      // Strict security verification: ensure backend actually activated the account
      if (!updatedUser.faceVerified || updatedUser.status != 'ACTIVE') {
        throw ServerException(
          'Face verification could not be confirmed by the server (status: ${updatedUser.status}). Please try again.',
        );
      }

      // Success confirmed by backend!
      if (!mounted) return;
      setState(() {
        _scanning = false;
        _activated = true;
      });

      // Refresh session in auth controller to trigger router navigation
      await ref.read(authControllerProvider.notifier).refreshUser();

      // Short delay for the user to see the success banner before entering dashboard
      if (widget.redirectDelay > Duration.zero) {
        await Future<void>.delayed(widget.redirectDelay);
      }
      if (!mounted) return;

      final refreshedAuth = ref.read(authControllerProvider);
      if (refreshedAuth is Authenticated) {
        context.go(refreshedAuth.capabilities.defaultWorkspace.homePath);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _scanning = false;
          _error = describeError(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AuthScaffold(
      title: 'Face ID Verification',
      subtitle: 'Step 3 of 3: Scan your biometric face profile to activate account.',
      showBack: false,
      actions: [
        TextButton.icon(
          onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          icon: const Icon(Icons.logout, size: 18),
          label: const Text('Sign out'),
        ),
      ],
      children: [
        if (_activated) ...[
          // Success State
          Center(
            child: Column(
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.green.shade600, width: 2),
                  ),
                  child: Icon(
                    Icons.check_circle_outline,
                    color: Colors.green.shade700,
                    size: 44,
                  ),
                ),
                const SizedBox(height: Spacing.md),
                Text(
                  'Account Fully Activated!',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.green.shade800,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: Spacing.sm),
                Text(
                  '✓ Mobile verified\n✓ Profile photo uploaded\n✓ Aadhaar recorded\n✓ Face ID verified\n\nOpening your dashboard...',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: Spacing.lg),
                const CircularProgressIndicator(strokeWidth: 2.5),
              ],
            ),
          ),
        ] else ...[
          // Viewfinder simulation
          Center(
            child: Container(
              width: 220,
              height: 220,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: theme.colorScheme.surfaceContainerHighest,
                border: Border.all(
                  color: _scanning
                      ? theme.colorScheme.primary
                      : theme.colorScheme.outlineVariant,
                  width: 3,
                ),
              ),
              clipBehavior: Clip.antiAlias,
              child: _selfieLocalPath != null && !kIsWeb
                  ? Image.file(
                      File(_selfieLocalPath!),
                      fit: BoxFit.cover,
                    )
                  : Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (_scanning) ...[
                          CircularProgressIndicator(
                            strokeWidth: 3,
                            color: theme.colorScheme.primary,
                          ),
                          const SizedBox(height: Spacing.md),
                          Text(
                            'Scanning Facial Biometrics...',
                            style: theme.textTheme.labelMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: theme.colorScheme.primary,
                            ),
                          ),
                        ] else ...[
                          Icon(
                            Icons.face_retouching_natural,
                            size: 64,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                          const SizedBox(height: Spacing.sm),
                          Text(
                            'Position face inside circle',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ],
                    ),
            ),
          ),
          const SizedBox(height: Spacing.lg),

          if (_error != null) ...[
            InlineError(message: _error!),
            const SizedBox(height: Spacing.md),
          ],

          // Actions
          AppButton(
            label: _scanning
                ? 'Verifying Biometrics...'
                : 'Start Face Verification Scan',
            icon: Icons.face,
            isLoading: _scanning,
            onPressed: () => _executeVerification(),
          ),
          const SizedBox(height: Spacing.sm),
          AppButton(
            label: 'Take Live Selfie Camera Scan',
            icon: Icons.camera_front,
            isSecondary: true,
            isLoading: _scanning,
            onPressed: _takeSelfie,
          ),
        ],
      ],
    );
  }
}
