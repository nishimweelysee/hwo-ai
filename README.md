# Health Workforce Optimizer (HWO)

AI-based system for healthcare workforce workload optimization, staff planning, and operational efficiency.

## Architecture

| Component | Technology | Port | Purpose |
|-----------|------------|------|---------|
| **Frontend** | Next.js 16 | 3000 | Web UI — proxies `/api/*` to the backend |
| **Backend** | Spring Boot 3 | 8080 | REST API — all `/api/*` routes |
| **AI Service** | Python FastAPI + scikit-learn | 8000 | ML workload forecasting (optional; backend has a fallback) |
| **Database** | PostgreSQL | 5432 | Backend data store |
| **Mobile** | Expo (React Native) | 8081 (Metro) | Staff mobile app (optional) |

The web app never calls the backend URL directly from the browser. All API traffic goes to relative `/api/*` paths; Next.js rewrites those to `BACKEND_API_URL` (default `http://localhost:8080`) on the server. This works the same in dev (`next dev`) and prod (`next start`).

## Prerequisites

- **Node.js** 20+
- **Java** 17+ (required for prod profile / packaged jar)
- **Maven** (`mvn`)
- **Python** 3.9+ (AI service; auto-installed by run-remote scripts)
- **PostgreSQL** 16
- **ngrok** (only for remote access scripts)

## Quick start — remote access (recommended)

Use the bundled scripts to start everything, open ngrok tunnels, and launch the mobile app. Works from any network (phone on cellular, laptop on another Wi‑Fi, etc.).

### macOS / Linux / WSL

```bash
# One-time: install ngrok and add your authtoken
brew install ngrok                        # or https://ngrok.com/download
ngrok config add-authtoken <YOUR.\run-remote.ps1 -Profile prod _TOKEN>   # from https://dashboard.ngrok.com

./run-remote.sh                           # dev profile (default)
./run-remote.sh --profile prod            # compiled backend jar + next start
./run-remote.sh --prod --no-mobile        # prod, web + backend only
```

### Windows (PowerShell)

```powershell
winget install ngrok.ngrok
ngrok config add-authtoken <YOUR_TOKEN>

.\run-remote.ps1                          # dev profile (default)
           # compiled backend jar + next start
.\run-remote.ps1 -Prod -NoMobile          # prod, web + backend only
```

When ready, the script prints public URLs:

```
  Web app (open in browser):   https://xxxx.ngrok-free.app
  Mobile API target:           https://yyyy.ngrok-free.app
  Mobile bundler (Metro):      https://zzzz.ngrok-free.app   (if ngrok mode)
```

- **Web**: open the web URL in any browser.
- **Mobile**: scan the Expo QR code in Expo Go (script writes `mobile/.env` automatically).

Press **Ctrl+C** to stop all services and tunnels.

### Profiles

| | **dev** (default) | **prod** |
|---|---|---|
| Backend | `mvn spring-boot:run` (hot reload) | `mvn package` → `java -jar` |
| Web | `npm run dev` | `npm run build` → `npm run start` |
| AI | uvicorn (auto-creates venv on first run) | same |
| Mobile | Expo dev bundler | Expo dev bundler |

First prod run builds the backend jar and Next.js bundle (several minutes). Artifacts are cached for later runs.

### Script options

**Bash** (`run-remote.sh`):

```bash
./run-remote.sh --profile dev|prod
./run-remote.sh --prod | --dev          # shorthand
./run-remote.sh --no-mobile
PROFILE=prod ./run-remote.sh
MOBILE_MODE=tunnel ./run-remote.sh      # Expo built-in tunnel instead of ngrok Metro
BACKEND_PORT=8080 WEB_PORT=3000 ./run-remote.sh
SKIP_POSTGRES_CHECK=1 ./run-remote.sh
```

**PowerShell** (`run-remote.ps1`):

```powershell
.\run-remote.ps1 -Profile dev|prod
.\run-remote.ps1 -Prod | -Dev
.\run-remote.ps1 -NoMobile
$env:PROFILE="prod"; .\run-remote.ps1
$env:MOBILE_MODE="tunnel"; .\run-remote.ps1
```

Logs: `.remote-logs/` (backend, web, AI, ngrok, build output).

## Manual local setup

If you prefer running services separately (no ngrok):

### One-time setup

```bash
npm install

# PostgreSQL — create database if needed
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -c "CREATE DATABASE hwo;"

# AI service (optional)
cd ai-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..
```

### Run (four terminals)

**Terminal 1 — PostgreSQL** (if not already running):

```bash
docker compose up -d postgres
# or: sudo pg_ctlcluster 16 main start   (Linux)
```

**Terminal 2 — Backend**:

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

**Terminal 3 — AI service** (optional):

```bash
cd ai-service
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
```

**Terminal 4 — Web**:

```bash
npm run dev
```

Web: http://localhost:3000 · Backend: http://localhost:8080 · AI: http://localhost:8000

### Verify

```bash
curl http://localhost:8080/api/auth/registration-config   # backend
curl http://localhost:8000/health                         # AI (optional)
curl http://localhost:3000/api/auth/registration-config   # proxied via Next.js
```

### Stop services

```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null   # web
lsof -ti:8000 | xargs kill -9 2>/dev/null   # AI
lsof -ti:8080 | xargs kill -9 2>/dev/null   # backend
```

## Login

The backend auto-seeds on first startup (`DataInitializer`).

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@hospital.org` | `admin123` |
| Staff (example) | `dr.sarah.chen@hospital.org` | `staff123` |

Staff emails follow the pattern `{name}@hospital.org` (derived from display name). Register new users at http://localhost:3000/register.

## Mobile app

See [mobile/README.md](mobile/README.md) for full details.

```bash
cd mobile
npm install
cp .env.example .env   # edit EXPO_PUBLIC_BACKEND_URL for your setup
npx expo start
```

When using `run-remote.sh` / `run-remote.ps1`, `mobile/.env` is written automatically with the ngrok backend URL.

| Scenario | Env var | Value |
|----------|---------|-------|
| Same machine / simulator | `EXPO_PUBLIC_BACKEND_URL` | `http://localhost:8080` |
| Android emulator | `EXPO_PUBLIC_BACKEND_URL` | `http://10.0.2.2:8080` |
| Physical device on LAN | `EXPO_PUBLIC_BACKEND_URL` | `http://<lan-ip>:8080` |
| Remote (run-remote script) | `EXPO_PUBLIC_BACKEND_URL` | ngrok backend URL (auto) |
| Via Next.js proxy | `EXPO_PUBLIC_API_URL` | `http://<host>:3000` |

## Environment variables

| Variable | Default | Used by |
|----------|---------|---------|
| `BACKEND_API_URL` | `http://localhost:8080` | Next.js `/api` rewrite (server-side) |
| `AI_SERVICE_URL` | `http://localhost:8000` | Spring Boot → AI service |
| `EXPO_PUBLIC_BACKEND_URL` | — | Mobile → backend directly |
| `EXPO_PUBLIC_API_URL` | — | Mobile → Next.js proxy |

For prod builds, `run-remote` sets `BACKEND_API_URL` from `BACKEND_PORT` so the baked-in proxy target matches the running backend.

## API overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Login |
| `/api/auth/register` | POST | Register |
| `/api/auth/session` | GET | Current session (Bearer token) |
| `/api/predictions` | GET | Forecast, metrics, feature importance |
| `/api/predictions/retrain` | POST | Train ML model via AI service |
| `/api/dashboard/overview` | GET | Dashboard summary |

Full backend API docs: [backend/README.md](backend/README.md)

## User guides

Step-by-step documentation for every sidebar module: [docs/user-guides/README.md](docs/user-guides/README.md)

## Production deployment

For Docker-based production deployment, see `docker-compose.prod.yml` and `Dockerfile`.
