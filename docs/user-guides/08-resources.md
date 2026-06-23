# Resources / Inventory Management

**Route:** `/resources`  
**Purpose:** Full inventory management — stock levels, adjustments, inter-department transfers, procurement workflow, **AI demand forecasting**, reorder optimization, and movement history.

## Who uses it

Operations managers, supply chain staff, and department heads. **Admin** and **Manager** roles can create and update inventory; other roles can view.

## AI capabilities

When the Python AI service is running (port 8000), inventory management uses ML for:

| Feature | What it does |
|---------|----------------|
| **Demand forecasting** | Predicts weekly/daily usage from stock movement history (issue patterns, trends) |
| **Reorder optimization** | GBM model suggests quantities, priority scores, and days-of-cover |
| **Portfolio analysis** | Dashboard summary: at-risk count, projected spend, top risks |
| **Procurement ranking** | Ranks open procurement requests by urgency and cost |

If the AI service is offline, the module falls back to rule-based thresholds (reorder level, critical utilization %).

## Tabs

| Tab | What it does |
|-----|----------------|
| **Overview** | KPIs (beds, occupancy, shortages, utilization), reorder alerts, budget impact, and **reorder suggestions** with one-click procurement |
| **Inventory** | Searchable/filterable item list with location, supplier, SKU; add, edit, delete, adjust stock; **CSV export** |
| **Transfers** | Create and progress transfer requests; delete pending or cancelled requests |
| **Procurement** | Create purchase requests, **auto-procure from suggestions**, advance through approval → ordered → received; delete pending/rejected |
| **History** | Audit trail of stock movements, filterable by item |

## Inventory settings

Configure under **Configuration → Inventory**:

- **Critical utilization (%)** — marks items as Critical when in-use ratio exceeds this threshold
- **Default reorder level** — used when an item has no explicit reorder level
- **Procurement lead time (days)** — shown in overview context
- **Auto-procurement suggestions** — enables creating procurement from reorder suggestions
- **Low-stock notifications** — enables reorder alerts and suggestions

## Stock adjustments

From **Inventory → Adjust** on any item:

- **receive** — add to available stock
- **issue** — deploy items (increases in-use)
- **return** — items returned from use
- **adjust** — manual correction to available count

## Reorder suggestions

When stock is low or utilization is critical, the system suggests quantities, priority, and estimated cost. Managers can:

1. Select suggestions on **Overview** and click **Create procurement**
2. Use **Auto-procure all suggestions** on the **Procurement** tab

Suggestions respect inventory settings and skip items that already have open procurement requests.

## Backend APIs

| Action | Endpoint |
|--------|----------|
| Dashboard | `GET /api/resources` |
| Metadata | `GET /api/resources/meta` |
| List inventory (search/filter) | `GET /api/resources/inventory?search=&type=&departmentId=` |
| Export CSV | `GET /api/resources/inventory/export` |
| Item detail + movements | `GET /api/resources/inventory/{id}` |
| Reorder suggestions | `GET /api/resources/reorder-suggestions` |
| AI health | `GET /api/resources/ai/health` |
| AI demand forecast | `GET /api/resources/ai/demand/{id}` |
| Movement history | `GET /api/resources/movements?resourceId=` |
| Create item | `POST /api/resources/inventory` |
| Update item | `PATCH /api/resources/inventory/{id}` |
| Delete item | `DELETE /api/resources/inventory/{id}` |
| Adjust stock | `POST /api/resources/inventory/{id}/adjust` |
| Create transfer | `POST /api/resources/transfers` |
| Update transfer | `PATCH /api/resources/transfers/{id}` |
| Delete transfer | `DELETE /api/resources/transfers/{id}` |
| Create procurement | `POST /api/resources/procurement` |
| Auto-procure from suggestions | `POST /api/resources/procurement/from-suggestions` |
| Update procurement | `PATCH /api/resources/procurement/{id}` |
| Delete procurement | `DELETE /api/resources/procurement/{id}` |

### Python AI service endpoints

| Action | Endpoint |
|--------|----------|
| Predict demand | `POST /inventory/predict-demand` |
| Optimize reorders | `POST /inventory/optimize-reorders` |
| Analyze portfolio | `POST /inventory/analyze-portfolio` |
| Rank procurement | `POST /inventory/rank-procurement` |

Write operations require Admin, or Manager with `settings:manage` / `data:manage` permission.

## Troubleshooting

- **No action buttons** — sign in as Admin or Manager; Analyst/Viewer are read-only.
- **Empty transfers/procurement on existing DB** — restart backend; sample requests seed when those tables are empty.
- **Cannot delete item** — items with `inUse > 0` must be returned first.
- **Auto-procure disabled** — enable **Auto-procurement suggestions** under Configuration → Inventory.
- **AI banner shows Offline** — start the AI service: `cd ai-service && python3 -m uvicorn main:app --port 8000`
