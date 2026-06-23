# Dashboard

**Route:** `/dashboard`  
**Purpose:** Executive overview of workforce workload, wellness risk, predictions, and department allocation.

## Who uses it

Hospital administrators, workforce planners, and department heads who need a single-screen snapshot of operations.

## What you see

- **KPI cards** — total staff, average workload, wellness alerts, prediction accuracy (from live API data).
- **Workload by hour** — bar chart of patient/staff load across the day.
- **Workload trend** — actual vs predicted monthly trend (predictions require a trained model).
- **Wellness alerts** — staff flagged for burnout or high overtime.
- **Allocation heatmap** — department staffing intensity.
- **Department list** — staff counts and workload per department.

## How to use

1. Open **Dashboard** from the left sidebar.
2. Review KPIs at the top; numbers refresh on each page load.
3. Click **Export predictions** to download forecast data as CSV (requires trained model).
4. Click **Share** to email a dashboard snapshot to colleagues (enter comma-separated addresses).
5. Click the **gear icon** to open **Dashboard Preferences**:
   - Toggle workload charts, wellness alerts, and allocation heatmap visibility.
   - Click **Save** — preferences persist to your profile.

## Backend APIs

| Action | Endpoint |
|--------|----------|
| Load departments | `GET /api/departments` |
| Hourly workload | `GET /api/workload?type=byHour` |
| Trend data | `GET /api/workload?type=trend` |
| Wellness summary | `GET /api/wellness` |
| Predictions | `GET /api/predictions` |
| Heatmap | `GET /api/dashboard/heatmap` |
| Export | `GET /api/predictions/export` |
| Share | `POST /api/dashboard/share` |
| Save preferences | `PATCH /api/profile` |

## AI connection

Prediction accuracy and trend “predicted” line use the ML model trained in **AI Prediction**. Train a model first for full dashboard forecast features.

## Troubleshooting

- **Empty charts** — ensure PostgreSQL is seeded (restart backend on a fresh DB) or import data via **Data Collection**.
- **Prediction accuracy shows “—”** — go to **AI Prediction** and click **Retrain model**.
- **Share fails** — confirm you are logged in; JWT is required for all API calls.
