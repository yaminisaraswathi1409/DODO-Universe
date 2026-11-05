# DODO Universe — Mobile (Flutter)

One Flutter app (Android + iOS) with four role-based dashboards: Customer, Vendor, Driver, Admin.
It is a client of the existing Go backend; it has no backend or database of its own.

Phase 1 status: foundation only (architecture, API client, phone+OTP auth, role-based navigation placeholders).
See `docs/PHASE1_BACKEND_API_INVENTORY.md` for the backend API inventory and the known gaps.

## Run

```powershell
cd mobile
C:\flutter\bin\flutter.bat pub get

# Android emulator (default API: http://10.0.2.2:8080/api/v1 — the emulator's alias for the Windows host)
C:\flutter\bin\flutter.bat run

# Physical device on the same network
C:\flutter\bin\flutter.bat run --dart-define=API_BASE_URL=http://<PC-LAN-IP>:8080/api/v1

# Production build: APP_ENV and an https API_BASE_URL are mandatory, otherwise the app refuses to start
C:\flutter\bin\flutter.bat build apk --release --dart-define=APP_ENV=production --dart-define=API_BASE_URL=https://<host>/api/v1
```

Start the backend first (`backend/`, port 8080). Plain-HTTP traffic is permitted only in Android *debug* builds.

## Quality gates

```powershell
C:\flutter\bin\flutter.bat analyze
C:\flutter\bin\flutter.bat test
C:\flutter\bin\flutter.bat build apk --debug
```

## Layout

`lib/app` (app, router, theme) · `lib/core` (api, config, errors, storage, widgets, integrations) ·
`lib/features/<feature>` · `lib/shared` (workspace model, shared widgets).

## Notes

- Android build needs NDK 28.2.13676358 (installed via the Android SDK tooling).
- iOS: compiling and signing require macOS + Xcode. Not verified on Windows.
- Security: do not ship to production until the backend issues signed, expiring session tokens (inventory gap G1).
