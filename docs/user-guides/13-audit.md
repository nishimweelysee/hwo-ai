# Audit & Logging

**Route:** `/audit`  
**Purpose:** Search audit trails, detect anomalies, export logs, and run forensic queries.

## Who uses it

Security officers, compliance auditors, and IT administrators.

## What you see

- **Audit log table** — timestamp, user, action, type.
- **Filters** — all, login, data, export, admin.
- **Search** — full-text search across log entries.
- **Anomaly detection** — suspicious login and export patterns.
- **Forensic tools** — export full trail, user activity lookup.

## How to use

1. Open **Audit & Logging**.
2. Use the **filter tabs** to narrow by event type.
3. Type in the **search box** to find specific users or actions.
4. Review **Anomaly detection** for flagged patterns.
5. Click **Export CSV** or **Export Excel** — downloads authenticated CSV via `apiDownload` (JWT included).
6. Click **Export full audit trail** for complete history.

## Backend APIs

| Action | Endpoint |
|--------|----------|
| List logs | `GET /api/audit?type=` |
| Search | `GET /api/audit/search?q=&type=` |
| Anomalies | `GET /api/audit/anomalies` |
| Export | `GET /api/audit/export?format=csv` |

## AI connection

None.

## Troubleshooting

- **Empty log table** — audit records seed on backend first run; perform actions (login, import, export) to generate new entries.
- **Export downloads HTML error** — ensure you use the in-app export buttons (not direct browser URL) so JWT is sent.
- **Search returns nothing** — try broader terms or switch filter to **all**.
