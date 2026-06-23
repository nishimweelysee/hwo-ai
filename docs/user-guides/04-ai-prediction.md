# AI Prediction

**Route:** `/ai-prediction`  
**Purpose:** Train ML models and view workload forecasts with model comparison and export.

## Who uses it

Data scientists, workforce planners, and administrators who need data-driven staffing forecasts.

## Prerequisites

- **Python AI service** running on port 8000 (`cd ai-service && python3 main.py`).
- **Spring Boot backend** with `AI_SERVICE_URL=http://localhost:8000`.
- Workload records in PostgreSQL (seeded or imported).

## What you see

- **Retrain model** — triggers full training pipeline.
- **Forecast chart** — predicted workload for upcoming periods.
- **Model metadata** — algorithm, accuracy (MAPE), last trained date.
- **Feature importance** — which inputs drive predictions.
- **Model comparison** — side-by-side metrics for two saved models.
- **Export** — download predictions as CSV.

## How to use

1. Confirm AI service is healthy: `curl http://localhost:8000/health`.
2. Open **AI Prediction**.
3. Click **Retrain model** — backend sends workload history to Python `/train`, stores model config in DB.
4. Wait for success message; page reloads forecast from `GET /api/predictions`.
5. Select two models in **Compare models** to see accuracy differences.
6. Click **Export predictions** to download results.

## Data flow

```
Frontend → POST /api/predictions/retrain
         → Spring Boot PredictionService
         → Python POST /train
         → Model saved in PostgreSQL
         → GET /api/predictions → Python POST /forecast
```

## Backend APIs

| Action | Endpoint |
|--------|----------|
| Retrain | `POST /api/predictions/retrain` |
| Current forecast | `GET /api/predictions` |
| List models | `GET /api/predictions/models` |
| Compare | `GET /api/predictions/compare?modelA=&modelB=` |
| Export | `GET /api/predictions/export` |
| Workload summary | `GET /api/workload/summary` |

## AI connection

**Required for full ML features.** Retrain trains:

1. **Global monthly model** — hospital-wide workload forecast (AI Prediction charts)
2. **Per-department daily models** — used by Scheduling for surge targets and staffing multipliers

The Python service (`/train`, `/forecast`, `/forecast-series`, `/predict-point`, `/rank-assignees`) uses a **Ridge + HistGradientBoosting ensemble** with:

- Rich daily features (lag-1/7/14, rolling stats, EWMA, seasonality)
- **CV-tuned blend weights** (not fixed 35/65)
- **Bias correction** and wider confidence bands from residual quantiles

Active models are stored in PostgreSQL and shared by Prediction and Scheduling. Inventory and Wellness also use the same AI service on separate endpoints.

Enable **Auto-retrain** in Configuration → AI & Predictions for weekly scheduled retraining.

## Troubleshooting

- **Training failed** — check AI service logs; ensure `scikit-learn` dependencies are installed.
- **403 on retrain** — endpoint is `/retrain` not `/train` (security filter).
- **Empty forecast** — insufficient workload history; import more data and retrain.
- **MAPE shows N/A** — model not yet trained on current dataset.
