# HWO AI Prediction Service

Python FastAPI + scikit-learn service for workload forecasting (prototype spec).

## Setup

```bash
cd ai-service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --reload --port 8000
```

## Endpoints

- `GET /health` - Health check
- `POST /train` - Train model on workload data
- `POST /forecast` - Generate forecasts from trained coefficients

## Environment

No env vars required. Configure `AI_SERVICE_URL` in Next.js `.env` to use this service instead of built-in TypeScript model.
