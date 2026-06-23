# Data Management

**Route:** `/data-management`  
**Purpose:** Configure retention, encryption, backups, integrations, data lineage, archives, and quality metrics.

## Who uses it

Data governance teams, IT security, and database administrators.

## What you see

- **Retention & privacy** — years to retain, anonymization toggle, backup frequency.
- **Encryption status** — algorithm in use (from API).
- **System integrations** — HIS and HR connection status.
- **Data quality** — completeness, accuracy, integrity issue count.
- **Data lineage** — source systems and record counts.
- **Archival browser** — historical archive periods.

## How to use

1. Review encryption and integration status cards.
2. Adjust **Retention years**, **Backup frequency**, and **Anonymization** as needed.
3. Click **Save settings** — persists via `PATCH /api/data-settings`.
4. Inspect **Data lineage** for HIS, HR, and manual import record counts.
5. Browse **Archives** for past quarterly snapshots.
6. Monitor **Data quality** metrics — derived from workload and staff counts in the database.

## Backend APIs

| Action | Endpoint |
|--------|----------|
| Settings | `GET /api/data-settings` |
| Update | `PATCH /api/data-settings` |
| Lineage | `GET /api/data-settings/lineage` |
| Archives | `GET /api/data-settings/archives` |

## AI connection

None.

## Troubleshooting

- **HIS disconnected** — no workload records in DB; import data via **Data Collection**.
- **HR disconnected** — no staff records; add staff or restart backend seed.
- **Quality metrics low** — import more complete workload history.
