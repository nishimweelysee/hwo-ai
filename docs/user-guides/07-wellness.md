# Staff Wellness

**Route:** `/wellness`  
**Purpose:** Monitor burnout risk, satisfaction trends, surveys, feedback, and recommended interventions.

## Who uses it

HR, employee health teams, and managers responsible for staff wellbeing.

## What you see

- **Wellness KPIs** — average score, at-risk count, survey response rate.
- **Trend chart** — wellness scores over time.
- **Burnout risk alerts** — staff with high overtime and risk level.
- **Recommended interventions** — active programs from the database.
- **Staff satisfaction survey** — all questions from the backend survey API.
- **Anonymous feedback** — rating and free-text submission.

## How to use

1. Review KPI cards and trend chart for department-wide health.
2. Address **Burnout Risk Alerts** — high-risk staff appear with overtime hours.
3. Check **Recommended interventions** for system-suggested programs.
4. Complete the **Staff Satisfaction Survey**:
   - Answer each question (scale 1–5 where applicable).
   - Click **Submit** — saved via `POST /api/wellness/survey`.
5. Submit **Anonymous Feedback** with star rating and comments.

## Backend APIs

| Action | Endpoint |
|--------|----------|
| Summary | `GET /api/wellness` |
| Trend | `GET /api/wellness/trend` |
| Survey questions | `GET /api/wellness/survey` |
| Submit survey | `POST /api/wellness/survey` |
| Feedback | `POST /api/wellness/feedback` |
| Interventions | `GET /api/wellness/interventions` |

## AI connection

When the Python AI service is running (port 8000), wellness uses:

- **Burnout risk (GBM)** — `POST /wellness/predict-risk` via `GET /api/wellness/ai/risk/{staffId}`
- **Intervention ranking** — top intervention suggested on each alert card
- **Feedback sentiment** — urgency/themes stored on `POST /api/wellness/feedback`

Alerts show AI risk probability and recommended intervention when the service is online. Falls back to rule-based scoring if offline.

## Troubleshooting

- **No alerts** — wellness seed data may be empty; restart backend on fresh DB.
- **Survey shows few questions** — all questions from API are displayed; backend provides 5 default questions.
- **Interventions empty** — `WellnessIntervention` records seed on first backend start when table is empty.
