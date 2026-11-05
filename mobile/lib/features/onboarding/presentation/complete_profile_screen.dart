import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/errors/error_message.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../core/widgets/state_widgets.dart';
import '../../authentication/application/auth_controller.dart';
import '../../authentication/presentation/auth_scaffold.dart';

/// Step 2 of Onboarding: Complete Profile Details.
/// Collects profile photo, address, bio, and optional Aadhaar number.
class CompleteProfileScreen extends ConsumerStatefulWidget {
  const CompleteProfileScreen({super.key});

  @override
  ConsumerState<CompleteProfileScreen> createState() => _CompleteProfileScreenState();
}

class _CompleteProfileScreenState extends ConsumerState<CompleteProfileScreen> {
  static const defaultAvatarUrl =
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400';

  final _formKey = GlobalKey<FormState>();
  final _addressController = TextEditingController(text: 'Choutuppal, Telangana, India');
  final _aadhaarController = TextEditingController(text: '1234-5678-9012');
  final _bioController =
      TextEditingController(text: 'Experienced equipment owner and farm provider.');
  final _avatarUrlController = TextEditingController(text: defaultAvatarUrl);

  final _picker = ImagePicker();
  String? _pickedLocalPath;
  bool _loading = false;
  bool _uploadingImage = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = ref.read(authControllerProvider);
      if (auth is Authenticated) {
        final u = auth.user;
        if (u.addressText != null && u.addressText!.isNotEmpty) {
          _addressController.text = u.addressText!;
        }
        if (u.aadhaarNumber != null && u.aadhaarNumber!.isNotEmpty) {
          _aadhaarController.text = u.aadhaarNumber!;
        }
        if (u.bio != null && u.bio!.isNotEmpty) {
          _bioController.text = u.bio!;
        }
        if (u.avatarUrl != null && u.avatarUrl!.isNotEmpty) {
          _avatarUrlController.text = u.avatarUrl!;
        }
      }
    });
  }

  @override
  void dispose() {
    _addressController.dispose();
    _aadhaarController.dispose();
    _bioController.dispose();
    _avatarUrlController.dispose();
    super.dispose();
  }

  Future<void> _pickImage(ImageSource source) async {
    setState(() => _error = null);
    try {
      final picked = await _picker.pickImage(
        source: source,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      if (picked == null) return;

      setState(() {
        _pickedLocalPath = picked.path;
      });

      // Try uploading right away so URL is ready
      await _uploadLocalImage(picked.path);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Camera or photo library access was cancelled or unavailable: ${e.toString()}';
        });
      }
    }
  }

  Future<String?> _uploadLocalImage(String path) async {
    setState(() => _uploadingImage = true);
    try {
      final uploadedUrl = await ref.read(authRepositoryProvider).uploadImage(path);
      if (mounted) {
        setState(() {
          _avatarUrlController.text = uploadedUrl;
        });
      }
      return uploadedUrl;
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Photo upload failed: ${describeError(e)}. You can still proceed by entering a photo URL.';
        });
      }
      return null;
    } finally {
      if (mounted) {
        setState(() => _uploadingImage = false);
      }
    }
  }

  Future<void> _submit() async {
    if (_loading || _uploadingImage) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    var avatarUrl = _avatarUrlController.text.trim();

    // If a local image was picked but not uploaded yet, try uploading now
    if (_pickedLocalPath != null &&
        (avatarUrl.isEmpty || avatarUrl == defaultAvatarUrl)) {
      final uploaded = await _uploadLocalImage(_pickedLocalPath!);
      if (uploaded != null) {
        avatarUrl = uploaded;
      }
    }

    if (avatarUrl.isEmpty) {
      avatarUrl = defaultAvatarUrl;
    }

    try {
      await ref.read(authRepositoryProvider).completeProfile(
            avatarUrl: avatarUrl,
            bio: _bioController.text.trim(),
            addressText: _addressController.text.trim(),
            aadhaarNumber: _aadhaarController.text.trim(),
          );

      // Refresh authenticated session to derive new user state
      await ref.read(authControllerProvider.notifier).refreshUser();

      if (!mounted) return;
      context.go('/verify-face');
    } catch (e) {
      if (mounted) setState(() => _error = describeError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AuthScaffold(
      title: 'Complete Profile Details',
      subtitle: 'Step 2 of 3: Provide a profile photo, address, and Aadhaar number before final face verification activation.',
      showBack: false,
      actions: [
        TextButton.icon(
          onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          icon: const Icon(Icons.logout, size: 18),
          label: const Text('Sign out'),
        ),
      ],
      children: [
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Avatar Preview & Picker
              Center(
                child: Column(
                  children: [
                    Stack(
                      children: [
                        CircleAvatar(
                          radius: 48,
                          backgroundColor: theme.colorScheme.surfaceContainerHighest,
                          backgroundImage: _pickedLocalPath != null && !kIsWeb
                              ? FileImage(File(_pickedLocalPath!)) as ImageProvider
                              : NetworkImage(_avatarUrlController.text.trim().isNotEmpty
                                  ? _avatarUrlController.text.trim()
                                  : defaultAvatarUrl),
                          onBackgroundImageError: (_, _) {},
                          child: _uploadingImage
                              ? Container(
                                  decoration: BoxDecoration(
                                    color: Colors.black45,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Center(
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.5,
                                      color: Colors.white,
                                    ),
                                  ),
                                )
                              : null,
                        ),
                        Positioned(
                          bottom: 0,
                          right: 0,
                          child: Material(
                            color: theme.colorScheme.primary,
                            shape: const CircleBorder(),
                            elevation: 2,
                            child: IconButton(
                              icon: const Icon(Icons.camera_alt, color: Colors.white, size: 20),
                              constraints: const BoxConstraints.tightFor(width: 36, height: 36),
                              padding: EdgeInsets.zero,
                              onPressed: () => _pickImage(ImageSource.camera),
                              tooltip: 'Take photo with camera',
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: Spacing.xs),
                    Text(
                      'Profile Photo *',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: Spacing.xs),
                    Wrap(
                      spacing: Spacing.sm,
                      children: [
                        OutlinedButton.icon(
                          onPressed: () => _pickImage(ImageSource.camera),
                          icon: const Icon(Icons.photo_camera, size: 16),
                          label: const Text('Camera'),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => _pickImage(ImageSource.gallery),
                          icon: const Icon(Icons.photo_library, size: 16),
                          label: const Text('Gallery'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Spacing.md),

              // Photo URL input
              AppTextField(
                controller: _avatarUrlController,
                label: 'Profile Photo URL *',
                hint: 'https://... or uploaded image path',
                prefixIcon: const Icon(Icons.link),
                validator: (v) => (v == null || v.trim().isEmpty)
                    ? 'Profile photo is required'
                    : null,
              ),
              const SizedBox(height: Spacing.md),

              // Address Field
              AppTextField(
                controller: _addressController,
                label: 'Primary Address / Location *',
                hint: 'City, State, Country',
                prefixIcon: const Icon(Icons.location_on_outlined),
                validator: (v) => (v == null || v.trim().isEmpty)
                    ? 'Address is required'
                    : null,
              ),
              const SizedBox(height: Spacing.md),

              // Aadhaar Number Field
              AppTextField(
                controller: _aadhaarController,
                label: 'Aadhaar Identity Number (Optional)',
                hint: '1234-5678-9012',
                prefixIcon: const Icon(Icons.badge_outlined),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: Spacing.md),

              // Bio Field
              AppTextField(
                controller: _bioController,
                label: 'Bio / Overview (Optional)',
                hint: 'Tell us briefly about yourself or services...',
                prefixIcon: const Icon(Icons.info_outline),
              ),

              if (_error != null) ...[
                const SizedBox(height: Spacing.md),
                InlineError(message: _error!),
              ],

              const SizedBox(height: Spacing.lg),
              AppButton(
                label: 'Save and Continue to Face ID',
                isLoading: _loading || _uploadingImage,
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
