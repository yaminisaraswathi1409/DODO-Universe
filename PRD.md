# UNIVERSAL OPPORTUNITY PLATFORM (UOP)
## Master Product Requirements Document (PRD) v2.0
### Microservices Architecture & High-Scalability Specification

---

## 1. Executive Summary & Microservices Paradigm

| Attribute | Details |
|---|---|
| **Document Title** | Universal Opportunity Platform (UOP) - Microservices PRD |
| **Architecture** | **Distributed Go (Golang) Microservices Platform** |
| **Version** | 2.0.0 |
| **Target Stack** | **Go Microservices:** `api-gateway`, `user-service`, `opportunity-service`, `matching-service`, `chaining-service`, `notification-service` <br> **Inter-Service:** gRPC / HTTP REST & Async Event Bus (NATS/Redis/Kafka) <br> **Frontend:** Next.js App Router PWA + Advanced SEO <br> **Database:** Supabase PostgreSQL + PostGIS (Read-Replica Ready, Connection Pooled) <br> **Auth:** Distributed Supabase JWT Validation Middleware <br> **Mobile:** Flutter Ready (Stateless API schema) |

### 1.1 High-Scalability Vision
The **Universal Opportunity Platform (UOP)** is architected as an **event-driven, distributed Go microservices ecosystem** designed for massive horizontal scalability, ultra-low latency spatial matching, and multi-tenant fault tolerance.

As a platform serving millions of simultaneous Needs and Offers across diverse geographies (urban, semi-urban, and rural), UOP separates concerns into independent microservices, ensuring that a surge in spatial matching requests or notification broadcasts never impacts core transaction processing or API availability.

---

## 2. High-Scalability Go Microservices Topology

```
                                      +------------------------------------+
                                      | Next.js PWA & Flutter Mobile Client|
                                      +------------------------------------+
                                                        |
                                                        | HTTPS REST / WebSockets / JWT
                                                        v
                                      +------------------------------------+
                                      |    API GATEWAY (Go Microservice)   |
                                      | - Auth Validation (Supabase JWT)   |
                                      | - Rate Limiting & Circuit Breaking |
                                      | - Request Routing & CORS           |
                                      +------------------------------------+
                                                        |
         +------------------------+---------------------+------------------------+------------------------+
         | gRPC / REST            | gRPC / REST         | gRPC / REST            | gRPC / REST            | Async Events
         v                        v                     v                        v                        v
+------------------+     +------------------+  +------------------+     +------------------+     +--------------------+
|  User Service    |     | Opportunity Svc  |  |  Matching Svc    |     |  Chaining Svc    |     |  Notification Svc  |
| - Profiles       |     | - Needs / Offers |  | - PostGIS ST_D   |     | - Parent-Child   |     | - WebSockets       |
| - Trust Scores   |     | - 8 Plugins      |  | - Spatial Radii  |     |   Dependency     |     | - Push Notifications|
| - Identity / KYC |     | - State Machine  |  | - Radius Cache   |     | - Cascade Engine |     | - Event Consumer   |
+------------------+     +------------------+  +------------------+     +------------------+     +--------------------+
         |                        |                     |                        |                        |
         +------------------------+---------------------+------------------------+                        |
                                  | Connection Pool (`jackc/pgx/v5`)                                      |
                                  v                                                                       |
                   +--------------------------------+                                                     |
                   |  Supabase PostgreSQL + PostGIS | <---------------------------------------------------+
                   | (Read-Replicas & GIST Indexes) |          Async Event Bus (NATS / Redis PubSub)
                   +--------------------------------+
```

---

## 3. Microservice Decomposition & Service Responsibilities

### 3.1 Service Boundaries

| Microservice Name | Entrypoint Path | Primary Responsibilities | Scaling Profile |
|---|---|---|---|
| **1. `api-gateway`** | `cmd/gateway` | Public entrypoint, CORS handling, Supabase RS256/HS256 JWT validation, IP-based & User-based rate limiting (`golang.org/x/time/rate`), distributed trace ID injection (`X-Trace-ID`), REST/gRPC proxying. | High CPU & Network IO. Scale up to N instances behind Cloud Load Balancer. |
| **2. `user-service`** | `cmd/user-service` | User profile sync, identity management, dynamic trust score calculation, KYC status tracking, user preference storage. | Read-heavy. In-memory caching for trust scores. |
| **3. `opportunity-service`** | `cmd/opportunity-service` | Need & Offer lifecycle state machine, plugin registry execution (8 Opportunity Models), transaction management, status transitions (`OPEN`, `MATCHED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`). | Balanced Read/Write. Scales horizontally with database connection pooling. |
| **4. `matching-service`** | `cmd/matching-service` | High-performance PostGIS spatial matching queries (`ST_DWithin`, `ST_MakePoint`), distance ranking algorithms, geo-hashing, bounding box filtering, spatial cache management. | Computationally intensive. Read-heavy. Dedicated spatial read replicas. |
| **5. `chaining-service`** | `cmd/chaining-service` | Multi-layer parent-child opportunity dependency trees, cascading state propagation (e.g. Bricks -> Transport -> Driver), sub-task workflow execution. | Event-driven. Low latency processing. |
| **6. `notification-service`** | `cmd/notification-service` | Real-time WebSocket connection manager for PWA clients, push notification dispatching, SMS/Voice callback triggers, async event bus listener. | High concurrent connections (WebSockets). Long-lived stateless pods. |

---

## 4. Architectural Pillars of High Scalability

### 4.1 Stateless Microservices & Horizontal Autoscaling
* **Zero Local State:** No in-memory session state is stored inside any Go service pod.
* **Kubernetes HPA Ready:** Every service exposes `/healthz` and `/metrics` (Prometheus) endpoints, allowing Kubernetes Horizontal Pod Autoscalers to scale pods dynamically based on CPU, memory, or request throughput.

### 4.2 Database Scalability & PostGIS Performance Optimization
* **Connection Pooling:** All microservices access Supabase PostgreSQL using `jackc/pgx/v5/pgxpool` with configurable `MaxConns`, `MinConns`, `MaxConnLifetime`, and `MaxConnIdleTime`.
* **Spatial Indexing (`GIST`):** Spatial distance queries utilize PostGIS `GIST` indexes on `GEOMETRY(Point, 4326)` columns to execute spatial distance checks (`ST_DWithin`) in sub-10ms latency across millions of coordinates.
* **CQRS / Read-Write Separation:** Read-intensive queries (public SEO feed, spatial matching) target PostgreSQL Read Replicas, while mutations (creating needs, state transitions) target the Primary Write DB.

```sql
-- High-Performance PostGIS Spatial Index
CREATE INDEX IF NOT EXISTS idx_opportunities_location_gist 
ON opportunities USING GIST(location);

-- Compound Index for Filtered Matching
CREATE INDEX IF NOT EXISTS idx_opp_status_category_gist 
ON opportunities USING GIST(location) 
WHERE status = 'OPEN';
```

### 4.3 Asynchronous Event Bus & Messaging
Inter-service decoupling is achieved via an **Asynchronous Event Bus** abstraction (supports local Go channels, Redis Pub/Sub, NATS JetStream, or Apache Kafka):

```
[Opportunity Created] ---> (Event Bus: `opportunity.created`) ---> [Matching Service]
                                                              ---> [Notification Service]
                                                              ---> [Analytics Service]
```

* **Event Types:**
  * `opportunity.created`
  * `opportunity.matched`
  * `opportunity.status_changed`
  * `chain.child_spawned`
  * `user.trust_updated`

### 4.4 Multi-Level Caching Strategy
To ensure sub-50ms global API response times:
1. **L1 In-Memory LRU Cache:** Caching immutable static data (category definitions, plugin configuration schemas) inside the microservice process memory.
2. **L2 Shared Cache (Redis):** Caching frequent spatial match results, active user trust scores, and public SEO feed listings with short TTLs (30s - 300s).

### 4.5 Resiliency & Fault Tolerance Patterns
* **Circuit Breakers:** Implemented using `sony/gobreaker` to prevent cascading failures if a downstream microservice experiences degradation.
* **Retries with Exponential Backoff:** Database and inter-service HTTP/gRPC requests execute with context timeouts (`context.WithTimeout`) and exponential backoff retry policies.
* **Graceful Shutdown:** All Go microservices listen for `SIGINT` and `SIGTERM` OS signals, gracefully closing DB connection pools and draining active HTTP connections before exit.

---

## 5. Microservices Directory Structure

To support clean microservices separation within a clean Go workspace (monorepo format), code is structured as follows:

```
/backend
├── cmd/
│   ├── gateway/              # API Gateway entrypoint
│   │   └── main.go
│   ├── user-service/         # User & Trust Score Service entrypoint
│   │   └── main.go
│   ├── opportunity-service/  # Need & Offer Core Service entrypoint
│   │   └── main.go
│   ├── matching-service/     # PostGIS Spatial Matcher entrypoint
│   │   └── main.go
│   ├── chaining-service/     # Chained Multi-Layer Task entrypoint
│   │   └── main.go
│   └── notification-service/ # Async Notifications & WebSockets entrypoint
│       └── main.go
├── internal/
│   ├── config/               # Microservice configuration loader
│   ├── domain/               # Domain entities & interfaces
│   ├── event/                # Async Event Bus abstractions (NATS/Redis/Channels)
│   ├── gateway/              # Reverse proxy & JWT middleware logic
│   ├── handler/              # HTTP REST & gRPC Handlers
│   ├── middleware/           # Auth, CORS, Rate-Limiting, Tracing
│   ├── plugin/               # 8 Opportunity Model Workflow Plugins
│   ├── repository/           # PostgreSQL pgxpool data access layer
│   ├── service/              # Business logic services
│   └── spatial/              # PostGIS calculations & spatial algorithms
├── migrations/               # Database SQL schema migrations
├── pkg/
│   ├── logger/               # Structured JSON logger (slog)
│   ├── response/             # Standard API JSON Envelope
│   └── tracer/               # X-Trace-ID Context propagation
├── go.mod
└── go.sum
```

---

## 6. End-to-End Microservice Request Flow

```
[Client PWA / App]
       |
       | 1. HTTP POST /api/v1/opportunities (JWT Bearer Header)
       v
[API Gateway (`cmd/gateway`)]
       |-- 2. Validate Supabase RS256/HS256 JWT Token
       |-- 3. Check Rate Limit (User IP / User ID)
       |-- 4. Inject X-Trace-ID Header
       v
[Opportunity Service (`cmd/opportunity-service`)]
       |-- 5. Validate Payload & Execute Plugin Rules
       |-- 6. Insert Record into PostgreSQL via pgxpool (`status = OPEN`)
       |-- 7. Publish Event `opportunity.created` to Event Bus
       v
+-------------------------------+-------------------------------+
|                               |                               |
v (Async Event)                 v (Async Event)                 v (HTTP Response)
[Matching Service]              [Notification Service]          [API Gateway -> Client]
|-- Run PostGIS ST_DWithin      |-- Send WebSocket push         |-- 201 Created JSON
|-- Calculate Distance          |   to nearby active users      |   Envelope Response
|-- Rank Eligible Providers     +-------------------------------+-----------------------+
```

---

## 7. Non-Functional Requirements (NFRs) for High Scalability

| Category | SLA / Standard | Implementation Mechanism |
|---|---|---|
| **API Throughput** | 50,000+ Requests/sec across cluster | Horizontal pod scaling of Go microservices |
| **Spatial Query Latency** | < 15ms (p99) for 50km radius checks | PostGIS `GIST` indexing + `ST_DWithin` spatial query tuning |
| **Gateway Auth Latency** | < 2ms per request | In-memory public key caching for Supabase JWT RS256 validation |
| **Availability Target** | 99.99% Uptime | Multi-zone deployment, zero-downtime rolling updates |
| **Database Pool Efficiency** | Zero connection exhaustion | `pgxpool` connection pooling with strict MaxConns per pod |
| **Fault Isolation** | Single service outage never brings down core API | Circuit breakers (`gobreaker`), isolated microservice deployment pods |

---

## 8. Implementation & Migration Roadmap

1. **Phase 1 (Active Monorepo Refactoring):** Refactor `cmd/` to host individual microservice entrypoints (`gateway`, `user-service`, `opportunity-service`, `matching-service`, `chaining-service`, `notification-service`).
2. **Phase 2 (Event Bus & Inter-Service Messaging):** Implement the `internal/event` Event Bus abstraction for decoupled asynchronous task execution.
3. **Phase 3 (PostGIS Indexing & Pool Optimization):** Tune PostGIS `GIST` indexes and pgxpool parameters for multi-thousand concurrent connections.
4. **Phase 4 (PWA & Flutter Microservice Integration):** Connect PWA frontend to API Gateway with seamless offline shell support and complete SEO SSR capabilities.

---

## 9. User Authentication, Onboarding & RBAC Pipeline Specification

### 9.1 New User Onboarding Lifecycle

```
[Sign Up (/signup)]
       |
       | 1. Full Name + Phone + Email
       v
[OTP Generation & Verification (/verify-otp)]
       |-- 2. Mobile OTP dispatched via user_otps
       |-- 3. Verify 6-digit code -> status = PENDING / OTP_VERIFIED
       v
[Profile Completion (/complete-profile)]
       |-- 4. Upload Passport Photo URL + Address + (Optional Aadhaar)
       |-- 5. Status transitions -> status = PROFILE_COMPLETED
       v
[Face ID Verification (/verify-face)]
       |-- 6. Biometric facial scan confirmation
       |-- 7. Status updated -> account_status = ACTIVE (is_verified = TRUE)
       v
[User Dashboard (/dashboard)]
```

---

### 9.2 Existing Active User Login Lifecycle

```
[User Login (/login)]
       |
       | 1. Enter Registered Mobile Phone Number
       v
[OTP Verification (/login)]
       |-- 2. Verify 6-digit OTP Code
       v
[Account Status Evaluation]
       |-- IF account_status == 'ACTIVE' OR is_verified == TRUE:
       |      ==> Route DIRECTLY to User Dashboard (/dashboard)
       |      ==> Signup, profile completion, and face verification are NEVER shown again.
       |-- IF account_status == 'PROFILE_COMPLETED':
       |      ==> Route to Face Verification (/verify-face)
       |-- IF account_status == 'PENDING' OR 'OTP_VERIFIED':
       |      ==> Route to Profile Completion (/complete-profile)
       |-- IF account_status == 'SUSPENDED' OR 'DEACTIVATED':
       |      ==> Deny Access & Display Deactivation Error Message
```

---

### 9.3 Admin & Super Admin Portal

```
[Admin Login Portal (/admin/login)]
       |
       | 1. Enter Admin Mobile (+919999999999) / Dev OTP (123456)
       | 2. Enforce Role Check -> role IN ('SUPER_ADMIN', 'ADMIN')
       v
[Admin Management Console (/admin/users)]
       |-- User Directory Auditing & Status Inspection
       |-- Account Activation & Deactivation (ACTIVE / SUSPENDED / DEACTIVATED)
       |-- Dynamic Platform Category & Service Creation (/categories)
       |-- Service Provider Approval Governance & Document Review (/admin/services/requests)
       |-- Category Requirement Schema Editor (/admin/categories/{id}/requirements)

---

## 10. Dynamic Service Provider Request & Approval Workflow Specification

### 10.1 Architecture & Multi-Stage State Machine

```
[User Dashboard (/dashboard)]
       |
       | 1. Select Service Category (Tractor, Cleaning, Plumbing, Electrical, Painting)
       | 2. Submit Provider Request
       v
[Service Status: PENDING_APPROVAL]
       |
       |-- Admin Reviews Request (/admin/services/requests)
       |      |-- IF Rejected: ==> Service Status: REJECTED (Reason recorded & shown to user)
       |      |-- IF Approved: ==> Service Status: DOCUMENTS_PENDING
       v
[Service Status: DOCUMENTS_PENDING]
       |
       | 3. User views dynamic DB-configured requirement schema (categories.required_documents)
       | 4. User submits dynamic fields & document photo URLs (/users/services/documents)
       | 5. Aadhaar requirement checked (prompted if not recorded)
       v
[Service Status: UNDER_REVIEW]
       |
       |-- Admin Reviews Submitted Details & Documents
       |      |-- IF Rejected: ==> Service Status: REJECTED (Reason shown; user can resubmit)
       |      |-- IF Approved: ==> Service Status: ACTIVE (is_available = TRUE)
       v
[Service Status: ACTIVE]
       ==> User is now authorized to offer this service & accept bookings.
```

### 10.2 Strict Status Separation Rules
1. **User Account Status vs Service Asset Status Separation**:
   - User Account (`users.status`): `PENDING`, `OTP_VERIFIED`, `PROFILE_COMPLETED`, `ACTIVE`, `SUSPENDED`.
   - Service Asset (`user_skills_assets.status`): `PENDING_APPROVAL`, `APPROVED`, `DOCUMENTS_PENDING`, `UNDER_REVIEW`, `ACTIVE`, `REJECTED`, `SUSPENDED`.
   - Being an `ACTIVE` user does **NOT** automatically make service assets active.
   - Users are strictly forbidden from setting service asset status to `ACTIVE` directly.
2. **Database-Driven Dynamic Requirement Schemas**:
   - Category requirements (e.g. Tractor registration number & vehicle photo vs Plumbing certification & experience) are stored dynamically as `JSONB` in `categories.required_documents`.
   - Admins configure and update these schemas live in the Admin Console without frontend code changes.
3. **Aadhaar Verification Rule**:
   - Normal signup/login does not enforce Aadhaar.
   - When a user requests to become a service provider, Aadhaar verification is enforced during document submission if not previously recorded.

### 10.3 End-to-End Traced Service Approval Data Flow & Fix Specifications

```
[User UI (/dashboard)]
  │-- Submits service request payload (category_id, asset_type, title, description)
  ▼
[Service Request API (POST /api/v1/users/services)]
  │-- Resolves target user via UUID, Supabase UID, Phone, or JWT Claims
  ▼
[Go Backend & Service Layer (user_service.go :: AddUserSkillAsset)]
  │-- Invokes userRepo.AddUserSkillAsset(...)
  ▼
[Supabase PostgreSQL Database (user_skills_assets table)]
  │-- Auto-migration in db.go guarantees columns: status, rejection_reason, documents, category_id
  │-- Inserts record with status = 'PENDING_APPROVAL' and is_available = FALSE
  ▼
[Admin API (GET /api/v1/admin/services/requests?status=ALL)]
  │-- Uses COALESCE(sa.status, 'PENDING_APPROVAL') = $1 in SQL query
  │-- Returns pending requests joined with user profile and category requirement schema
  ▼
[Admin Panel UI (/admin/users :: Service Approvals Tab)]
  │-- Renders request card/row under PENDING_APPROVAL
  │-- Admin approves request -> Status transitions to DOCUMENTS_PENDING
  │-- User submits dynamic details/documents -> Status transitions to UNDER_REVIEW
  │-- Admin reviews & approves -> Status transitions to ACTIVE (is_available = TRUE)
```

---

## 11. Dynamic Service Provider Verification System Architecture

### 11.1 Dynamic Field Types & Requirement Schemas
Admins configure service category verification requirements as a `JSONB` array in `categories.required_documents`. Zero code changes are required when creating new service categories.

Supported dynamic field types:
- `text`: Single line text (e.g. License / Reg Number)
- `number`: Numeric value (e.g. Experience Years)
- `date`: Date selector
- `select`: Dropdown menu with Admin-configured options
- `checkbox`: Agreement / Confirmation boolean
- `textarea`: Long text / Work summary
- `image` / `multi_image`: Single or multiple photo uploads (JPG, PNG, WEBP)
- `pdf` / `multi_pdf`: Single or multiple PDF document uploads
- `video` / `multi_video`: Single or multiple MP4/WEBM video uploads
- `url`: External URL reference

### 11.2 Secure Multi-Format Upload Architecture
- Backend endpoint: `POST /api/v1/upload` (`upload_handler.go`).
- Supports images, PDF documents, and MP4/WEBM video files up to 50MB.
- Serves uploaded files securely via `/uploads/*` static file handler.
- Frontend uploads files asynchronously before submitting completed verification payload.

### 11.3 Admin Verification Inspection & Governance
- Admin Panel (`/admin/users` :: Service Approvals Manager) provides deep inspection for any requested service.
- Renders submitted text, dates, select options, photo previews (`<img>`), PDF document links, and inline video player controls (`<video controls>`).
- Provides a live checklist comparing submitted data against category requirements.
- Moving service to `ACTIVE` automatically sets `is_available = TRUE`, making the verified service available for customer bookings.

---

## 12. Scenario 1: Multi-Layer Connected Logistics & Emergency Recovery Specification

### 12.1 Overview & Graph Ancestry Model
Scenario 1 (Srinivas's Bricks - Choutuppal Yard Transit Flow) demonstrates UOP's ability to recursively chain parent-child opportunities across six operational stages:
1. **Root Opportunity (#9001):** 10,000 Red Bricks Supply (`pending_matching`).
2. **Child Opportunity (#9002):** Logistical Transport flatbed 15-ton truck (`open_need`).
3. **Sub-Child (#9003):** Commercial Driver Placement for Suresh Class-A driver (`open_need`).
4. **Emergency Child (#9004):** SOS Highway Breakdown Roadside Repair (`incident_suspended`).
5. **Nested Child (#9005):** Auto Parts Procurement for Tata Part #TC-990 (`open_need`).
6. **Delivery & Settlement:** PoD QR validation, root completion, multi-tier escrow clearance.

### 12.2 Database Schema Additions (`000008_add_logistics_and_emergency_schema.up.sql`)
- `vehicle_driver_pairings`: Vehicle-to-driver assignments, license numbers, and Class-A verifications.
- `way_manifests`: Digital Way Manifests, routing barcodes, Proof of Loading (PoL) photo URLs, Proof of Delivery (PoD) QR codes and signature URLs.
- `incidents_telemetry`: Highway breakdown SOS incident tracking, GPS coordinates, static vehicle telemetry alerts ("No Movement Alert").
- `escrow_ledger`: Multi-tier financial ledger tracking deposits, transport fees, driver fees, mechanic fees, and auto-parts micro-escrow payouts.
- `parts_inventory`: Automobile spare parts catalog and stock management (Krishna Spares Tata Part #TC-990).

### 12.3 API Endpoints
- `POST /api/v1/voice/parse`: Audio/text NLU parsing engine.
- `POST /api/v1/logistics/cascade`: Spawns nested child opportunities.
- `POST /api/v1/logistics/sos`: Registers breakdown incidents and dispatches mobile mechanics.
- `POST /api/v1/logistics/manifest`: Generates way manifests and barcodes.
- `POST /api/v1/logistics/manifest/pol`: Verifies Proof of Loading photos.
- `POST /api/v1/logistics/manifest/pod`: Verifies Proof of Delivery QR/signatures and completes root opportunity.
- `GET /api/v1/parts/search`: Queries auto-parts stock.
- `POST /api/v1/parts/checkout`: Checks out auto parts and logs micro-escrow ledger entry.
- `POST /api/v1/logistics/pairings`: Assigns vehicle-to-driver pairings.
- `POST /api/v1/escrow/settle/{root_id}`: Clears escrow ledger and adjusts trust scores.
- `GET /api/v1/opportunities/{id}/tree`: Returns recursive opportunity ancestry graph tree.

---

## 13. Login OTP Authentication & Direct Dashboard Routing Specification

### 13.1 Root Cause & Compilation Fix
- **Root Cause of "Failed to fetch":** Go backend compilation error in `internal/handler/logistics_handler.go` (`response.Error` and `response.JSON` argument mismatch). The API server failed to start, causing all frontend `fetch` calls to `http://localhost:8080/api/v1/auth/request-otp` to fail with network errors.
- **Fix:** Corrected all `pkg/response` function calls in `logistics_handler.go` to match `(w, statusCode, message, data/error)` signature. `go build ./cmd/api` compiles with zero errors.

### 13.2 Existing User Direct Routing Protocol
- **Flow:** Phone Number $\to$ OTP Dispatch (`POST /api/v1/auth/request-otp`) $\to$ OTP Verification (`POST /api/v1/users/verify-otp`) $\to$ Session Persistence (`localStorage.setItem('uop_user')`) $\to$ **Direct Routing to `/dashboard`**.
- Existing users logging in via the `/login` route bypass repetitive onboarding/profile/face verification steps and land directly on their account dashboard.
- Admins route to `/admin/users`, while suspended/deactivated accounts display administrative hold notices.

---

## 14. Phase 2 REST API Test Verification Matrix

All 10 Phase 2 logistics, emergency recovery, escrow, and tree ancestry REST APIs have been empirically tested and verified against the running Go backend & Supabase PostgreSQL database:

| # | Endpoint | Method | Result | Verification Notes |
|---|---|---|---|---|
| 1 | `/api/v1/voice/parse` | `POST` | `PASS (200 OK)` | Audio/text NLU entity extraction (Bricks & Clutch Plate) verified. |
| 2 | `/api/v1/logistics/cascade` | `POST` | `PASS (201 Created)` | Transport flatbed child node spawned & saved to DB. |
| 3 | `/api/v1/logistics/pairings` | `POST` | `PASS (201 Created)` | Vehicle-to-driver pairing record & Class-A license inserted. |
| 4 | `/api/v1/logistics/manifest` | `POST` | `PASS (201 Created)` | Digital Way Manifest & barcode generated (`WM-UOP-1786701928`). |
| 5 | `/api/v1/logistics/manifest/pol` | `POST` | `PASS (200 OK)` | Proof of Loading (PoL) photo verified & status changed to `IN_TRANSIT`. |
| 6 | `/api/v1/logistics/sos` | `POST` | `PASS (200 OK)` | Highway SOS breakdown registered (`ACTIVE`, emergency repair child spawned). |
| 7 | `/api/v1/parts/checkout` | `POST` | `PASS (200 OK)` | Auto part checked out & micro-escrow ledger entry logged. |
| 8 | `/api/v1/logistics/manifest/pod` | `POST` | `PASS (200 OK)` | Proof of Delivery (PoD) QR signature verified (`DELIVERED`). |
| 9 | `/api/v1/escrow/settle/{root_id}` | `POST` | `PASS (200 OK)` | Multi-tier escrow ledger entries released across tree. |
| 10 | `/api/v1/opportunities/{id}/tree` | `GET` | `PASS (200 OK)` | Recursive opportunity ancestry graph fetched with parent-child relationships. |

---

## 15. Phase 3: Frontend Integration & Visualizer Specification

### 15.1 Component Architecture & Reuse
1. **Voice Assistant Mic Modal (`VoiceAssistantModal.tsx`):**
   * Pulse mic button modal supporting real-time voice-to-text NLU entity parsing (`POST /api/v1/voice/parse`).
   * Parses quantity, material category, estimated budget, and creates Root Opportunity #9001 on order confirmation.
2. **Opportunity Tree Visualizer (`OpportunityTreeVisualizer.tsx`):**
   * Recursive tree visualizer rendering multi-tier parent-child opportunities (Root #9001 $\to$ #9002 $\to$ #9003/#9004 $\to$ #9005).
   * Displays status badges (`PENDING_MATCHING`, `OPEN_NEED`, `ENROUTE`, `INCIDENT_SUSPENDED`, `REPAIR_COMPLETED`), parent-child links, and emergency incident banners.
3. **Driver SOS Emergency Console (`SOSEmergencyModal.tsx`):**
   * Driver breakdown reporting modal allowing immediate highway SOS dispatch (`POST /api/v1/logistics/sos`).
   * Suspends transport, triggers vehicle telemetry alert, and dispatches mobile mechanic Balaji.
4. **Interactive Dashboard Control Panel (`app/dashboard/page.tsx`):**
   * 6-Stage simulation controls connected directly to live backend REST APIs (`/logistics/cascade`, `/logistics/pairings`, `/logistics/manifest`, `/logistics/manifest/pol`, `/logistics/manifest/pod`, `/parts/checkout`, `/escrow/settle`, `/opportunities/{id}/tree`).


---

## 17. Scenario 1 Real Dynamic Marketplace Workflow Specification & Verification

### 17.1 Implementation Overview & Architecture
Scenario 1 has been converted from a dashboard simulation into a real, database-backed dynamic marketplace workflow operating on `/opportunities` and `/dashboard`.

1. **Dynamic DB-Configurable Need & Offer Creation (`CreateOpportunityModal.tsx`):**
   * Users click **"I Need Help"** (`type='NEED'`) or **"I Can Offer"** (`type='OFFER'`).
   * Form dynamically fetches `opportunity_fields` JSONB configuration from the selected Category in PostgreSQL DB.
   * Rendered field types: `text`, `number`, `select` (dropdown), `date`, `datetime`, `location`, `photo`, `video`, `file`, `textarea`.
   * Dynamic values saved directly to `opportunities.metadata.custom_fields` in PostgreSQL.

2. **Admin Dynamic Form Configurator (`admin/users/page.tsx` & `/admin/categories/{id}/opportunity-fields`):**
   * Admins can add, edit, or delete dynamic form fields for any category from the Admin Panel without developer code changes.
   * Updates `categories.opportunity_fields` column in DB.

3. **Need ↔ Offer Proximity & Category Matching Engine:**
   * Backend matching via `GET /api/v1/opportunities/{id}/matches` executes PostGIS spatial `ST_DWithin` proximity queries and category matching.
   * Calculates dynamic match scores based on distance and provider trust scores.
   * Enables users to accept/connect matches and set opportunity status to `IN_PROGRESS`.

4. **Dynamic Scenario 1 Logistics Chain Execution (`OpportunityDetailClient.tsx`):**
   * **Step 1 (Transport Requirement):** Spawns transport child node (`parent_opportunity_id` link) using `POST /api/v1/logistics/cascade`.
   * **Step 2 (Driver & Way Manifest):** Pairs commercial vehicle & driver using `POST /api/v1/logistics/pairings`, generates digital Way Manifest using `POST /api/v1/logistics/manifest`, and verifies Proof of Loading (PoL) photo using `POST /api/v1/logistics/manifest/pol` (`IN_TRANSIT`).
   * **Step 3 (Highway Breakdown SOS):** Registers breakdown incident using `POST /api/v1/logistics/sos`, updates transport status to `INCIDENT_SUSPENDED`, and creates emergency roadside repair child node.
   * **Step 4 (Spare Parts Procurement):** Queries parts stock using `GET /api/v1/parts/search`, checks out replacement part `#TC-990` via `POST /api/v1/parts/checkout`, and logs micro-escrow entry in `escrow_ledger` (`HELD`).
   * **Step 5 (Repair Complete & Resume):** Completes roadside repair and resumes transport (`ENROUTE`).
   * **Step 6 (Proof of Delivery & Escrow Settlement):** Verifies Proof of Delivery (PoD) QR code & signature using `POST /api/v1/logistics/manifest/pod`, marks root opportunity `COMPLETED`, and settles escrow tree using `POST /api/v1/escrow/settle/{root_id}` (`SETTLED`).

5. **Preserved Features & Strict Constraints:**
   * Reused database tables: `opportunities`, `categories`, `user_skills_assets`, `vehicle_driver_pairings`, `way_manifests`, `incidents_telemetry`, `escrow_ledger`, `parts_inventory`.
   * Voice AI engine files (`VoiceAssistantModal.tsx`, `/api/v1/voice/parse`) were **100% untouched**.

### 17.2 Verification & Test Results Matrix

| Test ID | Test Case | Target Component | Status | Verification Result |
|---|---|---|---|---|
| **Test A** | User Creates Bricks Need ("I Need Help") | `/opportunities` $\to$ `CreateOpportunityModal` | `PASS` | Saved to DB `opportunities` table (`type='NEED'`). Displayed live in marketplace feed with dynamic fields. |
| **Test B** | User Creates Bricks Offer ("I Can Offer") | `/opportunities` $\to$ `CreateOpportunityModal` | `PASS` | Saved to DB `opportunities` table (`type='OFFER'`). Displayed live in marketplace feed with dynamic fields. |
| **Test C** | Need ↔ Offer Matching & Acceptance | `/opportunities/{id}` $\to$ PostGIS Engine | `PASS` | PostGIS proximity matching identified matched offer. Match accepted & status updated. |
| **Test D** | Transport Cascade & Driver Pairing | `logistics/cascade` & `logistics/pairings` | `PASS` | Transport child node created with `parent_opportunity_id`. Driver Suresh paired. Manifest & PoL photo verified (`IN_TRANSIT`). |
| **Test E** | SOS Breakdown & Auto Parts Recovery | `logistics/sos` & `parts/checkout` | `PASS` | SOS incident registered, status suspended to `INCIDENT_SUSPENDED`, roadside repair child node created, `#TC-990` part checked out via micro-escrow, repair completed & transport resumed. |
| **Test F** | Delivery & Multi-Tier Escrow Settlement | `logistics/manifest/pod` & `escrow/settle` | `PASS` | PoD QR signature verified, root status set to `COMPLETED`, multi-tier escrow ledger entries released (`SETTLED`), tree visualizer rendered full graph ancestry. |
| **Test G** | Admin Form Configurator | Admin Panel (`/admin/users`) | `PASS` | Admins can add/edit custom form fields per category; persisted to DB `categories.opportunity_fields`. |
| **Safety** | Voice AI Code Preservation | `VoiceAssistantModal.tsx` & `/voice/parse` | `PASS` | Voice files and endpoints 100% untouched. |
| **Build** | Backend Go Compilation | `go build ./cmd/api` | `PASS` | Compiles with 0 errors. |
| **Build** | Frontend Next.js Build | `npm run build` | `PASS` | Compiles successfully into production bundle. |




