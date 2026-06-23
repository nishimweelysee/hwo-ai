# Scheduling

**Route:** `/scheduling`  
**Purpose:** Manage daily schedules, shift swaps, leave, on-call rosters, conflicts, and staff preferences.

## Who uses it

Scheduling coordinators, charge nurses, and department managers.

## What you see

- **KPI cards** — schedule coverage %, open shifts, swap requests (from live summary API).
- **Daily schedule table** — staff, role, shift, department with swap actions.
- **Conflicts** — scheduling rule violations for the selected date.
- **Leave requests** — pending and approved time off.
- **On-call roster** — after-hours coverage.
- **Allocation recommendations** — per-department staffing suggestions.
- **Staff preferences** — preferred shifts and dates to avoid.
- **Constraints editor** — max hours, rest between shifts, preference and skill-mix rules.

## How to use

1. Select a date with the date picker.
2. Review the schedule table; click **Request swap** on eligible rows.
3. Check **Conflicts** banner if violations exist.
4. Review **Staff Allocation Recommendations** for understaffed departments.
5. Edit staff preferences via **Edit** on a preference row.
6. Adjust **Scheduling constraints** and click **Save constraints**.
7. Click **Auto-schedule with AI** to fill open shifts and forecast gaps using AI-ranked staff (workload predictions set surge targets first).
8. Click **Publish & notify** to publish the schedule for the selected date (notifies staff count from backend).

## Backend APIs

| Action | Endpoint |
|--------|----------|
| Schedules | `GET /api/schedules?date=` |
| Summary | `GET /api/schedules/summary?date=` |
| Swap | `POST /api/schedules/swap` |
| Publish | `POST /api/schedules/publish` |
| Conflicts | `GET /api/scheduling/conflicts?date=` |
| Constraints | `GET/PATCH /api/scheduling/constraints` |
| Preferences | `GET/PATCH /api/scheduling/preferences` |
| What-if | `POST /api/scheduling/ai/what-if` |
| Auto-schedule | `POST /api/scheduling/ai/auto-schedule` (`date`) |
| Staff | `GET /api/staff` |
| Leave | `GET /api/leave` |
| On-call | `GET /api/on-call` |

## AI connection

Scheduling uses the Python AI service (port 8000) when healthy for:

- **Department daily forecasts** (`/forecast-series`) — per-department workload prediction drives surge staffing targets
- **Assignee ranking** (`/rank-assignees`) — blends rule-based scores with AI-optimized weights (skills, wellness, preferences, rest rules)
- **Hospital-wide forecast** — monthly ML model from **AI Prediction** boosts ICU/Emergency targets

Rule-based fallbacks apply when the AI service is offline. Skill requirements come from Configuration (`departmentSkillRequirements`, `shiftSkillRequirements`) and staff **Certifications**.

## Troubleshooting

- **Coverage 0%** — no schedules seeded for that date; backend seeds sample schedules on first run.
- **Swap fails** — ensure schedule row has `canSwap: true` and valid `scheduleId`.
- **Open shifts high** — add more schedule records or adjust target shift count in backend.
