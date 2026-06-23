# HWO Spring Boot Backend

REST API for Health Workforce Optimizer. All API routes (including auth) are served by this backend.

## Requirements

- Java 17+
- Maven
- PostgreSQL

## Run PostgreSQL

```bash
docker-compose up -d postgres
```

Or use an existing PostgreSQL instance.

## Run Backend

```bash
cd backend
mvn spring-boot:run
```

Backend runs on port 8080. Next.js proxies all `/api/*` to this backend.

## Configuration

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - PostgreSQL connection
- `JWT_SECRET` - Secret for JWT (min 32 chars)
- `AI_SERVICE_URL` - Python AI service URL (default: `http://localhost:8000`)
- `BACKEND_API_URL` - Set in Next.js `.env` for proxy (default: `http://localhost:8080`)

## Implemented Endpoints

- `GET /api/health` - Health check
- `GET /api/departments` - Departments list
- `GET /api/workload?type=byHour|trend` - Workload data
- `GET /api/workload/summary` - Workload summary
- `GET /api/workload/overtime` - Overtime by department
- `GET /api/workload/ratios` - Staff-to-patient ratios
- `GET /api/workload/anomalies` - Workload anomalies
- `GET /api/staff` - Staff list (POST to create)
- `GET /api/schedules` - Schedules (POST /api/schedules/swap for swap)
- `GET /api/wellness` - Wellness alerts
- `GET /api/wellness/trend` - Wellness trend
- `GET /api/compliance` - Compliance dashboard (live)
- `GET /api/compliance/meta` - Module meta
- `GET /api/compliance/templates` - Compliance templates
- `POST /api/compliance/scan` - Run compliance scan
- `POST /api/compliance/submit` - Queue regulatory submission
- `GET /api/resources` - Resources
- `GET /api/leave` - Leave requests (POST to create)
- `GET /api/on-call` - On-call schedule (POST to create)
- `GET /api/audit` - Audit logs (POST to create)
- `GET /api/audit/search` - Search audit logs
- `GET /api/predictions` - ML predictions (historical trend + forecast + metrics)
- `POST /api/predictions/retrain` - Train model via Python AI service
- `GET /api/predictions/models` - List saved models
- `GET /api/predictions/compare?modelA=&modelB=` - Compare two models
- `GET /api/predictions/export` - Export predictions as CSV
- `GET /api/certifications` - Certifications
- `GET /api/profile` - User profile (PATCH to update)
- `GET /api/mobile/schedules` - Mobile schedules
- `GET /api/mobile/alerts` - Mobile alerts
- `GET /api/mobile/wellness` - Mobile wellness

Stub endpoints return empty data for reports, dashboard, scheduling preferences, etc.
