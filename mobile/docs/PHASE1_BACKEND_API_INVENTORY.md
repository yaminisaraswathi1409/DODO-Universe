# DODO Universe Mobile — Phase 1 Backend API Inventory

Source of truth: `backend/cmd/api/main.go` (route registration, 2026-11-04), `backend/internal/handler/*`,
`backend/internal/middleware/jwt.go`, `backend/pkg/response/response.go`, `backend/internal/domain/models.go`,
and the web client `frontend/src/lib/api.ts`. `PROJECT_GUIDE.md` does not exist in this repository; `PRD.md`,
`README.md`, the backend and the web client were used instead.

**Verification level used below**

- **Read** – handler/service code was read in this phase.
- **Route** – only the route registration in `main.go` was inspected; request/response shapes were *not* verified and
  must be confirmed from the handler before the mobile app uses the endpoint (later phases).

No endpoint was invented. Nothing in the backend was changed.

## 1. Conventions

| Item | Actual behaviour |
|---|---|
| Base path | `/api/v1` (default dev port `8080`) |
| Response envelope | `{ "success": bool, "code": int, "message": string, "data": any, "error": any, "meta": any }` (`pkg/response`) |
| Errors | Same envelope with `success:false`; `error` is usually a string detail |
| Auth header | `Authorization: Bearer <value>` (see §2 – the value is **not** a signed token in the web flow) |
| Content type | `application/json`; uploads are `multipart/form-data` |
| Token refresh / logout | **None exist** |

## 2. Authentication model (critical findings)

1. Authentication is **phone number + OTP**. There is **no password** and no password-login endpoint.
2. `POST /users/verify-otp` returns the **user profile only — no access/refresh token**.
3. The web app then sends `user.supabase_uid` as the Bearer value (`getStoredAuthToken()` in `api.ts`). The mobile app
   does the same, because it is the only credential the backend accepts for a normal user.
4. `middleware.JWTAuthMiddleware` validates the Bearer value as an HS256 JWT, but **if validation fails and the string is
   non-empty it still accepts the request and uses the raw string as the user identity**
   (`claims.SupabaseUID = tokenString`). Handler-level checks (`requireAdmin`, `authorizeUserAccess`) likewise accept a
   raw user UUID or supabase uid as the Bearer value. Anyone who learns another user's `supabase_uid`/`id` can act as that
   user. **This is an existing backend security weakness, not introduced or changed by the mobile work.** It must be fixed
   (signed, expiring session tokens + refresh + revocation) before any production mobile release.
5. Many routes are registered outside the JWT group and resolve identity inside the handler (Bearer, or `X-User-ID`
   outside production).

## 3. Endpoints used by the mobile app in Phase 1

| Method | Endpoint | Auth | Role | Request | Response (`data`) | Level |
|---|---|---|---|---|---|---|
| POST | `/auth/request-otp` | none | any | `{phone}` | `{user, dev_otp_code?}` (`dev_otp_code` only when `ENV`/`APP_ENV` is not production). Also creates the user if unknown. | Read |
| POST | `/auth/signup` | none | any | `{full_name, phone, email?}` | `{user, dev_otp_code?}`, HTTP 201, user status `PENDING` | Read |
| POST | `/users/verify-otp` | none | any | `{phone, otp_code}` (6 digits) | `User` (no token) | Read |
| GET | `/users/me` | Bearer (JWT group) | any | – | `User`; 404 if the Bearer value matches no account | Read |
| GET | `/users/services?user_id=` | Bearer (handler-level) | owner/admin see documents; others get `documents` redacted | – | `UserSkillAsset[]` (`status`: PENDING_APPROVAL, DOCUMENTS_PENDING, UNDER_REVIEW, VERIFICATION_PENDING, APPROVED, ACTIVE, REJECTED) | Read |

`User` fields used: `id, supabase_uid, full_name, phone, email, status, role, is_suspended, suspension_reason,
mobile_verified, face_verified`. `status` ∈ `PENDING | OTP_VERIFIED | PROFILE_COMPLETED | ACTIVE | SUSPENDED`
(the web also treats `DEACTIVATED`). `role` ∈ `USER | ADMIN | SUPER_ADMIN`.
The mobile model deliberately ignores `otp_code`, `aadhaar_number` and `face_verification_ref`.

## 4. Roles and capabilities

- Backend account roles: **USER, ADMIN, SUPER_ADMIN** only.
- **Customer**: any active USER.
- **Vendor**: not a role. A user is a vendor when they have services (`/users/services`) in status APPROVED/ACTIVE.
- **Driver**: **not a role and not a capability anywhere in the backend.** Drivers appear only as order resource details
  (`driver_details`, vehicle–driver pairings). The mobile app uses a *provisional navigation hint*: an approved/active
  service whose `asset_type` contains `DRIVER`. This grants no permission; the backend still authorises every call.
- **Admin**: `role` is `ADMIN`/`SUPER_ADMIN`. Note: handler-level `requireAdmin` checks `Role == ADMIN` only, so a
  `SUPER_ADMIN` would be shown the admin workspace but be rejected (403) by admin endpoints. Needs a backend decision.
- Onboarding gate (mirrors the web): non-`ACTIVE` users (except admins) are held on an "incomplete onboarding" screen;
  suspended/deactivated users are held on a "suspended" screen.

## 5. Full route inventory by area (Route level unless stated)

Auth model column: **J** = inside JWT group; **H** = outside the group, identity resolved in handler; **P** = public.

### Authentication / profile
| Method | Endpoint | Auth |
|---|---|---|
| POST | `/auth/request-otp`, `/auth/signup`, `/users/verify-otp` | P (Read) |
| POST | `/users/complete-profile`, `/users/verify-face` | H (handlers read: resolve target by `user_id`/`phone`/Bearer – see risk R3) |
| POST | `/users/sync`, GET `/users/me`, POST `/users/invite`, GET `/users/onboarding-status` | J |
| GET | `/users/list` | H (admin listing) |
| GET/POST/PUT/DELETE | `/users/{userId}/addresses[...]` | H (`authorizeUserAccess`: owner or admin) |
| POST | `/users/status` | H |
| GET/POST | `/users/services`, POST `/users/services/documents`, POST `/users/skills-assets` | H |

### Customer: marketplace, catalog, cart, checkout, orders
`GET /categories`, `GET /categories/tree`, `GET /categories/{category_id}/vendors`, `GET /catalog/search`,
`GET /catalog/items/{id}`, `GET /catalog/{id}`, `GET|POST /catalog/compare`, `GET /vendors/{vendor_id}/catalog`,
`GET /vendors/{vendor_id}/catalog/tree`, `POST /cart/validate`, `POST /checkout/initiate`,
`POST /checkout/payment/callback`, `POST /checkout/{id}/cancel`, `GET /opportunities/my-orders`,
`GET /opportunities/public`, `GET /opportunities/matching`, `GET /opportunities/accepted`,
`POST /opportunities/create`, `POST /opportunities` (J), `GET /opportunities/{id}`,
`POST /opportunities/{id}/status`, `/accept`, `/confirm-resources`, `PUT /opportunities/{id}/resources`,
`GET /opportunities/{id}/history`, `GET /opportunities/{id}/tree` (J), `GET|POST /opportunities/{id}/delivery-otp` (J),
`POST /opportunities/{id}/verify-delivery-otp[-secure]` (J), `GET|POST /journeys[...]`, `POST /logistics/calculate-delivery` (J).

### Vendor
`GET|POST /vendor/categories/approvals|apply`, `PUT /vendor/categories/resubmit/{id}`, `POST /vendor/catalog`,
`PUT|DELETE /vendor/catalog/{id}`, `POST /vendor/catalog/{id}/move|archive`, `POST /vendor/catalog/reorder`,
`GET /vendor/orders`, `GET /vendor/orders/{id}`, `POST /vendor/orders/{id}/actions` (J),
`GET /provider/offers`, `POST /services/create`, `POST /users/services[/documents]`.

### Logistics / driver-facing (all J)
`POST /logistics/providers/match`, `/logistics/assign-driver-vehicle`, `/logistics/pairings`, `/logistics/cascade`,
`/logistics/manifest[s]`, `/logistics/manifest[s]/pol`, `/logistics/manifest[s]/pod`, `/logistics/sos`,
`/logistics/sos/incident`, `/logistics/sos/resolve`, `/opportunities/{id}/status-transition`,
`POST /escrow/settle/{root_id}`, `POST /parts/checkout`, `GET /parts/search`, `POST /voice/parse`.
**Gap:** there is no driver-specific "available jobs" or "assigned deliveries" feed endpoint. `GET /journeys` is the
commuter-journey API and its suitability for drivers is unconfirmed.

### Admin (handler-level admin checks; verified for user-management/catalog/category/form handlers in Phase 8)
`GET /admin/categories/approvals`, `POST /admin/categories/approvals/{id}/review`, `PUT /admin/categories/{id}/parent|selectable`,
`GET /admin/catalog/requests`, `POST /admin/catalog/{id}/approve|reject|request-changes`,
`GET /admin/services/requests`, `POST /admin/services/{id}/approve|review-documents`,
`POST /admin/vendors/{id}/suspend|reactivate`, `GET /admin/operations/metrics|stuck-orders|audit-logs|incidents`,
`POST /admin/operations/incidents/{id}/action`, `POST /admin/forms/schemas[/{id}/version]`,
`POST /admin/categories/{id}/requirements|opportunity-fields|vehicle-fields|driver-fields|related-services|resources|resource-requirements`.

### Notifications
`GET /notifications/`, `GET /notifications/unread-count`, `POST /notifications/read-all`, `POST /notifications/{id}/read`,
`GET|PUT /notifications/preferences` (H).

### Files, maps, payments
| Area | Actual state |
|---|---|
| Upload | `POST /upload` (multipart field `file`; JPG/PNG/WEBP/PDF/MP4/WEBM/MOV; 50MB). Registered outside the JWT group and no authentication check found in `upload_handler.go`. Files are saved to `./public/uploads` and served publicly at `/uploads/*`. |
| Private documents | **Not supported**: KYC/identity/prescription uploads would be publicly reachable by URL. |
| Maps | Web uses `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (browser-referrer restricted). No server-side maps API for mobile. |
| Payments | Checkout/payment callback/escrow endpoints exist; payment is simulated per earlier phases (no real gateway). |
| Push | No device-token registration endpoint; no FCM/APNs integration. |

## 6. Gaps, risks and blockers

| # | Item | Severity | Mobile handling |
|---|---|---|---|
| G1 | No signed session token, refresh or logout; JWT middleware accepts any non-empty Bearer string as identity (§2) | **Critical for production** | App uses `supabase_uid` as Bearer like the web; logout is local only; no refresh implemented. Documented, not worked around. |
| G2 | No password login | Info | Phone+OTP implemented; no password UI. |
| G3 | OTP is not sent by SMS: the service only logs it (`[COMMUNICATION GATEWAY] ...`) and returns `dev_otp_code` outside production. `GenerateRandomOTP` falls back to the fixed value `123456` if the RNG fails. | High | App ignores/never logs `dev_otp_code`. Real sign-in needs the server log or an SMS gateway. |
| G4 | No driver role/capability API | Medium | Provisional `DRIVER` asset-type hint; driver workspace is navigation only. |
| G5 | `SUPER_ADMIN` accepted by the web router but not by `requireAdmin` | Low | Mobile treats both as admin workspace. |
| G6 | Public, unauthenticated uploads and public file URLs | High for KYC | Upload boundary left unconfigured; KYC upload explicitly refused. |
| G7 | No push device registration | Medium | Push boundary left unconfigured. |
| G8 | Several endpoints trust `user_id`/`phone` in the body (e.g. `complete-profile`, `verify-face`) | Medium | Mobile does not call them in Phase 1. |
| G9 | No driver job feed | Medium | Placeholders only. |
| G10 | Mobile Google Maps keys (Android/iOS, package/bundle restricted) not provisioned | Info | Map boundary unconfigured. |

## 7. Backend changes made in Phase 1

None.

