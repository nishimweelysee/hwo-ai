# HWO User Guides

Step-by-step guides for every module in the Health Workforce Optimizer web app.

## Before you start

1. Start all services (see root [README.md](../../README.md)): PostgreSQL, Spring Boot backend (port **8080**), Python AI service (port **8000**), and Next.js frontend (port **3000**).
2. Sign in at http://localhost:3000 with your hospital account (default seed: `admin@hospital.org` / `admin123`).
3. All menu pages call the backend through `/api/*` with JWT authentication.

## Module guides

| # | Menu | Guide |
|---|------|-------|
| 1 | Dashboard | [01-dashboard.md](./01-dashboard.md) |
| 2 | Data Collection | [02-data-collection.md](./02-data-collection.md) |
| 3 | Workload Analysis | [03-workload-analysis.md](./03-workload-analysis.md) |
| 4 | AI Prediction | [04-ai-prediction.md](./04-ai-prediction.md) |
| 5 | Scheduling | [05-scheduling.md](./05-scheduling.md) |
| 6 | Reporting | [06-reporting.md](./06-reporting.md) |
| 7 | Staff Wellness | [07-wellness.md](./07-wellness.md) |
| 8 | Resources | [08-resources.md](./08-resources.md) |
| 9 | Skills & Competency | [09-skills.md](./09-skills.md) |
| 10 | Mobile | [10-mobile.md](./10-mobile.md) |
| 11 | Compliance | [11-compliance.md](./11-compliance.md) |
| 12 | Data Management | [12-data-management.md](./12-data-management.md) |
| 13 | Audit & Logging | [13-audit.md](./13-audit.md) |
| 14 | Profile | [14-profile.md](./14-profile.md) |
| 15 | Configuration | [15-configuration.md](./15-configuration.md) |

## Architecture quick reference

```
Browser (Next.js :3000)
    → /api/* proxy → Spring Boot (:8080) → PostgreSQL (:5432)
                                    ↘ Python AI (:8000)  [predictions only]
```

Only **AI Prediction** requires the Python AI service. Other modules work with backend + database alone, though some charts are richer when workload and staff data are seeded.
