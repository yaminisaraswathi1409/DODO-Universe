# Universal Opportunity Platform (UOP)
## Distributed Go Microservices & PWA Architecture

An AI-powered, voice-first digital ecosystem connecting human needs with available people, equipment, machinery, and services. Built for maximum scalability, spatial performance, and search engine discoverability.

---

## Architecture Topology

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
         | REST / gRPC            | REST / gRPC         | REST / gRPC            | REST / gRPC            | Async Events
         v                        v                     v                        v                        v
+------------------+     +------------------+  +------------------+     +------------------+     +--------------------+
|  User Service    |     | Opportunity Svc  |  |  Matching Svc    |     |  Chaining Svc    |     |  Notification Svc  |
| (Port: 8081)     |     | (Port: 8082)     |  | (Port: 8083)     |     | (Port: 8084)     |     | (Port: 8085)       |
| - Profiles       |     | - Needs / Offers |  | - PostGIS ST_D   |     | - Parent-Child   |     | - WebSockets       |
| - Trust Scores   |     | - 8 Plugins      |  | - Spatial Radii  |     |   Dependency     |     | - Push Notifications|
+------------------+     +------------------+  +------------------+     +------------------+     +--------------------+
```

---

## Microservices Breakdown

| Service Name | Path | Default Port | Description |
|---|---|---|---|
| **API Gateway** | `cmd/gateway` | `8080` | Public API Gateway, Supabase JWT validation, CORS, Rate Limiting. |
| **User Service** | `cmd/user-service` | `8081` | User profiles, Identity, KYC status, Dynamic Trust Score calculation. |
| **Opportunity Service** | `cmd/opportunity-service` | `8082` | Core Needs/Offers lifecycle state machine, 8 Workflow Plugins. |
| **Matching Service** | `cmd/matching-service` | `8083` | PostGIS spatial matching (`ST_DWithin`, `ST_MakePoint`), GIST spatial index lookup. |
| **Chaining Service** | `cmd/chaining-service` | `8084` | Multi-layer chained parent-child opportunity dependency trees. |
| **Notification Service** | `cmd/notification-service` | `8085` | Async event listener, push notifications, WebSocket manager. |
| **Unified API Server** | `cmd/api` | `8080` | Single-process server combining all handlers (ideal for local dev). |

---

## Quick Start & Running Instructions

### 1. Database & Migrations
Supabase PostgreSQL is used strictly as a managed PostgreSQL instance with PostGIS enabled.
```bash
psql $DATABASE_URL -f backend/migrations/000001_init_uop_schema.up.sql
```

### 2. Backend Go Microservices

#### Run Unified API (Local Dev Monolith Mode):
```bash
cd backend
go run ./cmd/api
```

#### Run Microservices Individually:
```bash
# Terminal 1: API Gateway
cd backend && go run ./cmd/gateway

# Terminal 2: User Service
cd backend && USER_SERVICE_PORT=8081 go run ./cmd/user-service

# Terminal 3: Opportunity Service
cd backend && OPPORTUNITY_SERVICE_PORT=8082 go run ./cmd/opportunity-service

# Terminal 4: Matching Service
cd backend && MATCHING_SERVICE_PORT=8083 go run ./cmd/matching-service

# Terminal 5: Chaining Service
cd backend && CHAINING_SERVICE_PORT=8084 go run ./cmd/chaining-service

# Terminal 6: Notification Service
cd backend && NOTIFICATION_SERVICE_PORT=8085 go run ./cmd/notification-service
```

### 3. Run Backend Unit Tests
```bash
cd backend
go test -v ./...
```

### 4. PWA Frontend (Next.js & Advanced SEO)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` to access the PWA application.

---

## Core Specifications & Documentation
- **Master PRD v2.0:** [PRD.md](file:///c:/DODO-Universe/PRD.md)
- **Implementation Architecture:** [implementation_plan.md](file:///C:/Users/shark/.gemini/antigravity-ide/brain/2dbfe6ed-d813-4160-a7c8-cd54a7880d84/implementation_plan.md)
