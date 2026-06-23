# HWO Mobile (Expo)

Mobile app for healthcare staff — shift schedule, swap requests, wellness check-in, and alerts. Connects to the Spring Boot backend (directly or via the Next.js API proxy).

## Setup

```bash
cd mobile
npm install
cp .env.example .env
```

Edit `.env` for your environment:

| Scenario | `EXPO_PUBLIC_BACKEND_URL` |
|----------|---------------------------|
| iOS Simulator / same machine | `http://localhost:8080` |
| Android Emulator | `http://10.0.2.2:8080` (auto-mapped from localhost) |
| Physical device on Wi‑Fi | `http://<your-lan-ip>:8080` e.g. `http://192.168.1.10:8080` |
| Via Next.js proxy | set `EXPO_PUBLIC_API_URL=http://<host>:3000` instead |

Start the backend first:

```bash
cd backend && mvn spring-boot:run
```

## Run

```bash
npx expo start
```

Press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go on a device.

## App features

| Tab | Description |
|-----|-------------|
| **Home** | Greeting, wellness stats, quick actions, upcoming shifts |
| **Schedule** | Week navigation, shift cards with swap requests, offline cache |
| **Wellness** | Daily check-in with mood indicator, satisfaction survey |
| **Alerts** | Filterable wellness & schedule notifications (badge count) |
| **Profile** | Account info, workforce link status, offline sync, sign out |

## Sign in

Staff accounts are auto-provisioned from seeded workforce data. Use a staff email from the database with password `staff123`, for example:

- Any staff email linked in **Staff** management (password defaults to `staff123` when auto-created)

Admin: `admin@hospital.org` / `admin123` (may not have a linked staff profile for schedule/wellness).

## API integration

The app uses a shared client in `lib/api.ts`:

- JWT validated on launch via `GET /api/mobile/me` (`lib/auth.tsx`)
- JWT sent as `Authorization: Bearer <token>` on authenticated requests
- Offline queue (`lib/offline-queue.ts`) for check-ins, surveys, and swap requests
- Push tokens registered with `POST /api/mobile/push-token` (`lib/push.ts`)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/mobile/health` | Connectivity check |
| `GET /api/mobile/me` | Session validation |
| `GET /api/mobile/schedules` | Personal schedule |
| `GET /api/mobile/wellness` | Wellness summary |
| `GET /api/mobile/survey` | Survey questions (same as web) |
| `POST /api/mobile/checkin` | Daily check-in with AI risk scoring |
| `POST /api/mobile/survey` | Staff satisfaction survey |
| `GET /api/mobile/alerts` | Wellness and schedule alerts |
| `POST /api/schedules/swap` | Shift swap request |
| `POST /api/mobile/push-token` | Register device for push alerts |

## Features

- **Shift schedule** — 7-day view with offline cache when signed in
- **Swap requests** — queued offline if needed, synced when online
- **Daily check-in** — score + overtime slider (same backend path as web, includes AI risk)
- **Staff survey** — configurable questions from backend settings
- **Alerts** — personalized workload and schedule notifications; push on medium/high check-in risk
- **Offline sync** — pending actions banner; auto-flush when network returns
- **Guest mode** — schedule tab only, empty until authenticated
