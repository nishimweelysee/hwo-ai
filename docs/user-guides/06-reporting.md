# Reporting

**Route:** `/reporting`  
**Purpose:** Generate standard and custom reports, benchmarks, executive summaries, and scheduled delivery.

## Who uses it

Executives, compliance officers, and analysts who need formatted workforce reports.

## What you see

- **Report library** — pre-built report types from the backend.
- **Benchmark comparison** — hospital metrics vs industry benchmarks.
- **Generate report** — one-click PDF-style generation for standard types.
- **Custom report builder** — select metrics and date range.
- **Executive summary** — high-level narrative report.
- **Scheduled reports** — automate recurring delivery.

## How to use

### Standard reports

1. Open **Reporting**.
2. Browse the report list.
3. Click **Generate** on a report type.
4. Download or view the generated output when the API returns success.

### Custom report

1. Select metrics and date range in the custom builder.
2. Click **Generate custom report**.
3. Review results or error message if generation fails.

### Executive summary

1. Click **Generate executive summary** in the executive section.
2. Summary is built from current workforce and wellness data.

### Schedule a report

1. In **Scheduled Reports**, enter name, frequency, and recipients.
2. Click **Add schedule** — appears in the list from `GET /api/scheduled-reports`.

## Backend APIs

| Action | Endpoint |
|--------|----------|
| List reports | `GET /api/reports` |
| Benchmarks | `GET /api/reports/benchmark` |
| Generate | `POST /api/reports/generate` |
| Custom | `POST /api/reports/custom` |
| Executive | `POST /api/reports/executive-summary` |
| Scheduled list | `GET /api/scheduled-reports` |
| Create schedule | `POST /api/scheduled-reports` |

## AI connection

None directly. Reports may include prediction data if a model is trained.

## Troubleshooting

- **Generation failed alert** — check backend logs; ensure required data tables are populated.
- **Empty benchmarks** — seed data may be minimal; import more workload records.
