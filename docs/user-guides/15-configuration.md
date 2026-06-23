# Configuration

**Route:** `/configuration`  
**Purpose:** Central admin hub for departments and system-wide settings.

## Who uses it

Hospital administrators, IT staff, and workforce planners who manage organizational structure and operational rules.

## Configuration tabs

| Tab | What you configure |
|-----|-------------------|
| **Departments** | Add, edit, deactivate, or delete hospital departments |
| **Roles** | Workforce roles (RN, Physician, etc.) and application user roles |
| **Organization** | Hospital name, timezone, fiscal year, locale |
| **Scheduling** | Max hours/week, rest between shifts, shift targets, skill mix rules |
| **Workload** | Nurse-patient ratio targets, alert thresholds, overtime warnings, peak hours |
| **AI & Predictions** | Forecast horizon, auto-retrain schedule, minimum training records |
| **Integrations** | HIS/HR URLs, sync frequency and time |
| **Notifications** | Email and alert toggles for schedules, wellness, compliance |
| **Data & Security** | Retention, backup, encryption, anonymization |

## Departments

1. Open **Configuration → Departments**.
2. Fill in name, code, target workload %, and description.
3. Click **Add department** (or **Update department** when editing).
4. Use the table actions to edit or delete.
5. Departments with assigned staff cannot be deleted until staff are reassigned.

Department IDs are used in **Data Collection** import templates (`department_id` column).

## Roles

### Workforce roles
Used when adding staff, building schedules, CSV imports, and skill mix charts.

1. Open **Configuration → Roles**.
2. Add roles with name, code, category (clinical/administrative/support).
3. Roles assigned to staff cannot be deleted until staff are reassigned.

### Application user roles
Control login access levels and the default role for new registrations.

1. Edit role names/descriptions in the **Application user roles** section.
2. Set **Default role for new users**.
3. Click **Save user roles**.

## Where settings are applied

1. Select a tab (Organization, Scheduling, etc.).
2. Adjust fields.
3. Click **Save settings** — stored in PostgreSQL via `PATCH /api/settings/{section}`.

Scheduling rules here are the same values used by the **Scheduling** module (`/api/scheduling/constraints`).

| Setting section | Used by |
|-----------------|---------|
| Scheduling | Scheduling KPIs, compliance work-hour checks |
| Workload | Workload Analysis nurse-patient ratio targets |
| Integrations | Data Management HIS/HR connection status |
| Data | Data Management retention and security panel |
| userRoles | User registration default role |
| Workforce roles | Data Collection, staff API, skill mix API |

## Backend APIs

| Action | Endpoint |
|--------|----------|
| List departments | `GET /api/departments` |
| Create department | `POST /api/departments` |
| Update department | `PATCH /api/departments/{id}` |
| Delete department | `DELETE /api/departments/{id}` |
| All settings | `GET /api/settings` |
| Section settings | `GET /api/settings/{section}` |
| Save section | `PATCH /api/settings/{section}` |
| List workforce roles | `GET /api/roles` |
| Create workforce role | `POST /api/roles` |
| Update workforce role | `PATCH /api/roles/{id}` |
| Delete workforce role | `DELETE /api/roles/{id}` |

## AI connection

The **AI & Predictions** tab configures forecast horizon and retrain behavior. Model training still runs from **AI Prediction**.

## Troubleshooting

- **Cannot delete department** — reassign staff in **Data Collection** first.
- **Settings reset after restart** — ensure backend connected to PostgreSQL; settings persist in `app_setting` table.
- **New departments missing from imports** — use the department `id` from the table in CSV templates.
