# Skills & Competency

**Route:** `/skills`  
**Purpose:** Certification tracking, competency gap analysis, AI training prioritization, skill matrix, and professional development planning.

## Who uses it

HR, clinical educators, department managers, and compliance staff. **Admin** and **Manager** roles can add and edit certifications; other roles can view.

## AI capabilities

When the Python AI service is running (port 8000):

| Feature | What it does |
|---------|----------------|
| **Training prioritization** | Ranks renewal and requirement-gap training by urgency |
| **Gap analysis** | Scores department certification coverage vs scheduling requirements |
| **Development recommendations** | Suggests programs per staff profile (`GET /api/certifications/ai/development/{staffId}`) |

Falls back to rule-based priorities when AI is offline.

## Tabs

| Tab | What it does |
|-----|----------------|
| **Overview** | KPIs, department coverage cards, AI training priorities |
| **Certifications** | Searchable staff cert list with CRUD, status badges, CSV export |
| **Skill Matrix** | Certification counts by department (all active depts, full cert catalog) |
| **Training** | Renewal needs + requirement gaps with AI rank and priority |
| **Development** | Professional development programs from Configuration → Skills |

## Gap analysis

Gaps are computed from **Scheduling → department skill requirements** (`departmentSkillRequirements` in settings), not heuristics. A gap is raised when staff in a department lack a required active certification.

Expiry alerts use **Configuration → Skills → Expiry warning (days)**.

## Backend APIs

| Action | Endpoint |
|--------|----------|
| Dashboard | `GET /api/certifications` |
| Metadata | `GET /api/certifications/meta` |
| List (filter) | `GET /api/certifications/list?search=&status=&departmentId=` |
| Export CSV | `GET /api/certifications/export` |
| AI health | `GET /api/certifications/ai/health` |
| Staff development AI | `GET /api/certifications/ai/development/{staffId}` |
| Get one | `GET /api/certifications/{id}` |
| Create | `POST /api/certifications` |
| Update | `PATCH /api/certifications/{id}` |
| Delete | `DELETE /api/certifications/{id}` |

### Python AI endpoints

| Action | Endpoint |
|--------|----------|
| Prioritize training | `POST /skills/prioritize-training` |
| Analyze gaps | `POST /skills/analyze-gaps` |
| Recommend development | `POST /skills/recommend-development` |

Write operations require Admin, or Manager with `data:manage` / `settings:manage`.

## Configuration

**Configuration → Skills**

- Expiry warning days
- AI training prioritization toggle
- Cert catalog and training programs (defaults seeded)

**Configuration → Scheduling**

- `departmentSkillRequirements` — drives gap analysis and scheduling skill mix

## Cross-module links

- **Scheduling** — uses certifications for assignee skill match and coverage forecasts
- **Compliance** — expiring cert counts
- **Workload** — `GET /api/workload/skill-mix` shows role distribution (separate from cert matrix)

## Troubleshooting

- **Skill matrix sparse** — add certifications to staff in **Certifications** tab or **Data Collection**
- **AI banner Offline** — start AI service: `cd ai-service && python3 -m uvicorn main:app --port 8000`
- **No competency gaps** — check department requirements under Configuration → Scheduling
- **Cannot edit** — sign in as Admin or Manager with manage permissions
