# Profile

**Route:** `/profile`  
**Purpose:** Manage your account details, password, notification preferences, and view recent activity.

## Who uses it

Every authenticated user.

## What you see

- **Profile form** — name, email, role, department.
- **Change password** — current and new password fields.
- **Notification preferences** — email alerts for schedules, wellness, compliance.
- **Recent activity** — last 10 actions from the audit system.

## How to use

1. Open **Profile** from the sidebar (bottom of menu).
2. Update name or department fields as needed.
3. Click **Save changes** — `PATCH /api/profile`.
4. To change password, enter current password and new password, then save.
5. Toggle notification checkboxes and save.
6. Review **Recent activity** for your last logins and actions.

## Backend APIs

| Action | Endpoint |
|--------|----------|
| Load profile | `GET /api/profile` |
| Update profile | `PATCH /api/profile` |
| User activity | `GET /api/user-activity?limit=10` |

Dashboard widget preferences are also stored on your profile under `preferences.visibleWidgets`.

## AI connection

None.

## Troubleshooting

- **Save fails** — verify JWT session is valid; log out and back in.
- **Role/department read-only** — some fields may be set by admin at registration.
- **Activity empty** — new accounts have no audit history until first actions.
