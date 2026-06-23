# Data Collection

**Route:** `/data-collection`  
**Purpose:** Import workforce CSV data, manage staff records, and monitor collection health.

## Who uses it

Data administrators and HR staff responsible for keeping staff, schedule, and workload records current.

## Tabs

| Tab | What it does |
|-----|----------------|
| **Import** | Download CSV templates, upload staff/shift/workload files, view validation summary |
| **Staff** | Manual staff entry and searchable roster |
| **History** | Persisted import runs with date filter |
| **Scheduler** | HIS/HR sync frequency (saved to Configuration → Integrations) |

## How to import data

1. Open **Import** and select a template type: **staff**, **shift**, or **patient** (workload).
2. Click **Download CSV** — templates use `department_code` and `role_code` from Configuration (not UUIDs).
3. Fill in rows; comment lines starting with `#` are ignored.
4. Upload a **CSV file only** (Excel is not supported).
5. Review the result: valid count, duplicates, errors, and quality %.

### Bulk sample data (20k rows)

For demos and load testing:

1. On **Import**, use **Download 20k sample** on each template card (or `GET /api/import/samples/{type}?rows=20000`).
2. Pre-generated files live in `sample-data/imports/` (`staff_20k.csv`, `shift_20k.csv`, `patient_20k.csv`). Regenerate with `python3 scripts/generate-import-csvs.py`.
3. **Import order:** staff → shift → patient (shift rows reference `staff0@hospital.org` … `staff19999@hospital.org`).
4. Staff imports over 2,000 rows skip per-row user linking; restart the backend or run account sync afterward if login accounts are needed.

### Column reference

**Staff:** `name`, `email` (optional), `role_code`, `department_code`

**Shift:** `staff_email`, `date`, `shift`, `status`, `department_code` — staff must exist; department on the row is used for the schedule.

**Workload (patient):** `date`, `hour`, `department_code`, `patient_volume`, `workload`, `staff_on_duty` (optional)

## Backend APIs

| Action | Endpoint |
|--------|----------|
| Module meta | `GET /api/import/meta` |
| Templates | `GET /api/import/templates` |
| Download template | `GET /api/import/templates/{type}` |
| Download bulk sample | `GET /api/import/samples/{type}?rows=20000` |
| Import file | `POST /api/import` (multipart: `file`, `type`) |
| Import history | `GET /api/import/history?startDate=&endDate=` |
| List staff | `GET /api/staff` |
| Create staff | `POST /api/staff` |

## Permissions

- **data:manage** (or settings:manage) — required for import and manual staff entry
- **settings:manage** — required to save sync schedule from the Scheduler tab

## AI connection

None directly. Imported **workload** rows feed **AI Prediction** training and **Workload Analysis** charts.

## Troubleshooting

- **Excel rejected** — save as CSV from your spreadsheet tool.
- **Shift import: email not found** — import or add staff first.
- **Unknown department_code** — check Configuration → Departments codes match the template reference block.
- **Duplicates** — staff matched by email; shifts by staff+date+shift; workload by department+date+hour.
- **Empty validation summary** — run at least one import; stats persist in import history.
