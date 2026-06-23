# AGENTS.md

## Cursor Cloud specific instructions

Health Workforce Optimizer (HWO) is a multi-service app. See `README.md` for full
docs; the notes below capture only non-obvious caveats for running it in this VM.

### Services (all run in dev mode)

| Service | Dir | Port | Start command |
|---------|-----|------|---------------|
| Spring Boot backend (REST API, owns `/api/*`) | `backend/` | 8080 | `mvn spring-boot:run -Dspring-boot.run.profiles=dev` |
| Python AI service (FastAPI, ML forecasting) | `ai-service/` | 8000 | `.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000` |
| Next.js frontend (web UI) | repo root | 3000 | `npm run dev` |
| PostgreSQL (backend datastore) | — | 5432 | `sudo pg_ctlcluster 16 main start` |

Start order that avoids transient errors: PostgreSQL → backend → AI service → frontend
(backend and AI service have no hard startup dependency on each other, but model
retraining calls the AI service).

### Non-obvious caveats

- **PostgreSQL must be started manually each session.** systemd is not active in this
  VM, so the apt postgres service is not auto-started. Run `sudo pg_ctlcluster 16 main start`.
  The DB lives in the VM snapshot, so the `hwo` database and seeded data persist across
  restarts; the `postgres` role password is `postgres`.
- **The frontend has NO API routes of its own.** `next.config.ts` rewrites all `/api/*`
  to the backend (`BACKEND_API_URL`, default `http://localhost:8080`). The Next.js app is
  a pure client (JWT stored in `localStorage`). The Prisma schema / `prisma/dev.db`,
  `@prisma/client`, `mongodb`, and `ioredis` deps in `package.json` are legacy and are NOT
  used at runtime — you do not need Postgres-vs-Prisma reconciliation, `prisma generate`,
  Mongo, or Redis to run the app.
- **Backend auto-seeds on startup** (`DataInitializer`): it creates an admin user
  `admin@hospital.org` / `admin123` and seeds departments, staff, workload history, etc.
  No manual seeding/migration step is needed (`spring.jpa.hibernate.ddl-auto=update`).
- **Python deps live in a venv at `ai-service/.venv`** (this VM's Python is
  externally-managed/PEP-668, so a venv is required). Run uvicorn via
  `ai-service/.venv/bin/uvicorn`.
- **AI service is optional for most pages.** The backend has a built-in fallback model;
  the AI service is exercised by the AI Prediction page's "retrain" action and forecasts.
- **`backend/target/` is checked into git.** Running the backend recompiles classes and
  shows them as modified — do not commit those build-artifact changes (`git restore backend/target`).

### Lint / test / build

- Frontend lint: `npx eslint` (script: `npm run lint`). The repo currently has
  pre-existing eslint errors/warnings unrelated to environment setup.
- There are no automated test suites (no `backend/src/test`, no `test` npm script).
- Frontend production build: `npm run build`. Backend package: `cd backend && mvn package`.
