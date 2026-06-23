# Health Workforce Optimizer (HWO)

AI-based system for healthcare workforce workload optimization, staff planning, and operational efficiency.

## Architecture

| Component | Technology | Port | Purpose |
|-----------|------------|------|---------|
| **Frontend** | Next.js 16 | 3000 | Web UI |
| **Backend** | Spring Boot 3 | 8080 | REST API — all `/api/*` routes |
| **AI Service** | Python FastAPI + scikit-learn | 8000 | ML workload forecasting |
| **Database** | PostgreSQL | 5432 | Backend data store |
| **Mobile** | Expo (React Native) | — | Staff mobile app (optional) |


## Ports (local dev)

| Service | Port |
|---------|------|
| Next.js frontend | 3000 |
| Spring Boot backend | **8080** |
| Python AI service | 8000 |
| PostgreSQL | 5432 |

Set `BACKEND_API_URL=http://localhost:8080` in `.env` (must match backend `SERVER_PORT`).

## Prerequisites

- **Node.js** 20+
- **Java** 17+
- **Maven** (`mvn`)
- **Python** 3.9+
- **PostgreSQL** 16 (local install or Docker)

## One-time setup

```bash
# 1. Install frontend dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env if your PostgreSQL credentials differ

# 3. Start PostgreSQL (if using Docker)
docker compose up -d postgres

# 4. Create the backend database (skip if it already exists)
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -c "CREATE DATABASE hwo;"

# 5. Install AI service dependencies
cd ai-service
pip install -r requirements.txt
cd ..
```

## Run all apps

Open **three separate terminals** and run these commands:

### Terminal 1 — PostgreSQL (if not already running)

```bash
docker compose up -d postgres
```

Skip this if you already have PostgreSQL running locally on port 5432.

### Terminal 2 — Spring Boot backend

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

Backend starts at http://localhost:8080. On first run it auto-creates tables and seeds workload data.

If port 8080 is in use, set `SERVER_PORT` and `BACKEND_API_URL` in `.env` to the same alternate port.

### Terminal 3 — Python AI service

```bash
cd ai-service
python3 main.py
```

AI service starts at http://localhost:8000.

Alternative with auto-reload:

```bash
cd ai-service
uvicorn main:app --reload --port 8000
```

### Terminal 4 — Next.js web app

```bash
npm run dev
```

Web app starts at http://localhost:3000.

## Verify everything is running

```bash
curl http://localhost:8080/api/health   # → {"status":"ok","service":"hwo-backend",...}
curl http://localhost:8000/health       # → {"status":"ok","service":"hwo-ai"}
curl http://localhost:3000/api/health   # → proxied to backend
```

## Login

Register a user at http://localhost:3000/register, or use an account already in the backend database.

Example (if you registered during setup):

| Email | Password |
|-------|----------|
| `admin@hospital.org` | `admin123` |

## Optional: Mobile app

```bash
cd mobile
npm install
EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start
```

## Optional: MongoDB + Redis

Add to `.env`:

```bash
MONGODB_URI="mongodb://localhost:27017"
MONGODB_DB="hwo_audit"
REDIS_URL="redis://localhost:6379"
```

lsof -ti:3000 | xargs kill -9 2>/dev/null
# Stop AI service (8000)
lsof -ti:8000 | xargs kill -9 2>/dev/null
# Stop backend (8080)
lsof -ti:8080 | xargs kill -9 2>/dev/null

## API overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/predictions` | GET | Forecast, metrics, feature importance |
| `/api/predictions/retrain` | POST | Train ML model via AI service |
| `/api/predictions/models` | GET | List saved models |
| `/api/predictions/compare` | GET | Compare two models |
| `/api/predictions/export` | GET | Download predictions CSV |
| `/api/auth/login` | POST | Login |
| `/api/auth/register` | POST | Register |

## User guides

Step-by-step documentation for every sidebar module is in [docs/user-guides/README.md](docs/user-guides/README.md).

Full backend API docs: [backend/README.md](backend/README.md)
# hwo-ai
