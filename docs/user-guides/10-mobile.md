# Mobile

**Route:** `/mobile`  
**Purpose:** Preview the staff mobile experience — upcoming shifts and push-style alerts.

## Who uses it

IT admins and managers validating what staff see on the companion mobile app (Expo).

## What you see

- **Upcoming shifts** — next 3 days of schedule entries.
- **Alerts** — schedule changes, swap approvals, and wellness reminders.

## How to use

1. Open **Mobile** from the sidebar.
2. Review shift cards (staff name, department, shift type, date).
3. Check alerts list for actionable notifications.
4. Use this view to verify backend mobile APIs before deploying the Expo app in `/mobile`.

## Backend APIs

| Action | Endpoint |
|--------|----------|
| Schedules (3 days) | `GET /api/mobile/schedules?days=3` |
| Alerts | `GET /api/mobile/alerts` |

## AI connection

None.

## Relationship to Expo app

The web **Mobile** page mirrors the same APIs used by the React Native app in the `mobile/` folder. Staff authenticate separately on mobile; this admin preview uses your web session JWT.

## Troubleshooting

- **No shifts** — ensure schedule records exist for upcoming dates (see **Scheduling**).
- **Alerts empty** — backend generates alerts from schedule swaps and wellness flags.
