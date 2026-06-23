# Compliance

**Route:** `/compliance`  
**Purpose:** Monitor regulatory staffing requirements, run live compliance scans, generate mandate reports, and queue regulatory submissions.

## Who uses it

Compliance officers, accreditation managers, and nursing leadership.

## Tabs

| Tab | What it does |
|-----|----------------|
| **Overview** | KPI cards and requirements summary (always live from schedules, certs, training) |
| **Requirements** | Detailed checklist with per-staff violation rows |
| **Submissions** | Mandate templates (WHO, JCI, EU, state) and regulatory submission forms |
| **History** | Paginated audit trail of scans, submissions, and saved requirement checks |

## How to use

1. Open **Overview** — status is computed live from Configuration scheduling rules, schedules, certifications, and training enrollments.
2. Click **Run compliance scan** to persist a snapshot to history (requirement checks + scan summary).
3. Review **Requirements** for staff-level hour limits, rest gaps, cert expiry, training completion, and today's schedule conflicts.
4. On **Submissions**, **Generate report** or **Generate & queue** — downloads CSV export available per template.
5. Filter **History** by record type: scan, submission, or requirement_check.

## Backend APIs

| Action | Endpoint |
|--------|----------|
| Module meta | `GET /api/compliance/meta` |
| Live dashboard | `GET /api/compliance` |
| Templates | `GET /api/compliance/templates` |
| Run scan | `POST /api/compliance/scan` |
| Submit report | `POST /api/compliance/submit` (`submissionId`, optional `templateId`) |
| Export CSV | `GET /api/compliance/export/{submissionId}` |
| History | `GET /api/compliance/history?recordType=` |

## Rules engine

Live checks (not stale seed data):

- **Work hours** — per-staff rolling 7-day total vs `maxHoursPerWeek` from Configuration
- **Rest between shifts** — consecutive day transitions (Night→Day, Evening→Day)
- **Certifications** — expiring within 30 days and expired active certs
- **Training** — enrollment completion rate from Skills module
- **Schedule conflicts** — same-day double booking, leave overlap, preferences, skill-mix gaps

Submissions are queued in `compliance_record` with audit log entries. External regulator delivery is simulated; CSV export provides the report artifact.

## AI connection

None directly. Scheduling conflict detection reuses the same skill-mix rules as AI-assisted scheduling.

## Troubleshooting

- **Review needed** — open **Requirements** for staff-level issues; fix schedules in **Optimization & Scheduling** or certs in **Skills**.
- **Stale history** — old seed rows are tagged `legacy`; run a new scan for current snapshots.
- **Template submit fails** — ensure you are signed in with a role that has Compliance menu access (Manager, Analyst).
