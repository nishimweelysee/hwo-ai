# Workload Analysis

**Route:** `/workload-analysis`  
**Purpose:** Deep-dive analytics on staffing load, overtime, skill mix, ratios, and anomalies.

## Who uses it

Workforce analysts, nursing directors, and operations managers optimizing shift coverage.

## What you see

- **Summary KPIs** — peak load, average ratio, overtime hours, anomaly count.
- **Hourly workload chart** — demand across 24 hours.
- **Monthly trend** — historical workload pattern.
- **Overtime by department** — which units run hot.
- **Nurse-to-patient ratios** — compliance-style ratio tracking.
- **Skill mix** — role distribution per department.
- **Anomaly detection** — unusual spikes flagged by the backend.
- **Staff wellness overlay** — filter staff by department with wellness indicators.

## How to use

1. Open **Workload Analysis** from the sidebar.
2. Review summary cards for quick health check.
3. Use charts to identify peak hours and departments needing more staff.
4. Check **Anomalies** for outliers worth investigating.
5. Use the department filter in the staff section to focus on one unit.
6. Export or share insights via **Reporting** for formal distribution.

## Backend APIs

| Action | Endpoint |
|--------|----------|
| Departments | `GET /api/departments` |
| Hourly workload | `GET /api/workload?type=byHour` |
| Trend | `GET /api/workload?type=trend` |
| Overtime | `GET /api/workload/overtime` |
| Ratios | `GET /api/workload/ratios` |
| Skill mix | `GET /api/workload/skill-mix` |
| Anomalies | `GET /api/workload/anomalies` |
| Summary | `GET /api/workload/summary` |
| Staff (wellness) | `GET /api/staff?wellness=true` |

## AI connection

Indirect — workload history used to train models in **AI Prediction**. No live AI calls on this page.

## Troubleshooting

- **Flat or empty charts** — seed or import workload records first.
- **Anomalies list empty** — normal when data variance is low; add more historical records.
