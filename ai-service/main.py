"""
AI-Based Health Workforce Workload Prediction Service
FastAPI + scikit-learn - Best practices: typed API, validation, CORS
"""
from datetime import datetime
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from ml_engine import (
    deserialize_artifact,
    predict_from_artifact,
    predict_from_artifact_obj,
    train_workload_model,
)
from wellness_engine import (
    analyze_feedback_sentiment,
    get_burnout_model_info,
    predict_burnout_risk,
    recommend_interventions,
)
from inventory_engine import (
    analyze_inventory_portfolio,
    optimize_reorders,
    predict_demand,
    rank_procurement,
)
from skills_engine import analyze_department_gaps, prioritize_training, recommend_development

app = FastAPI(
    title="HWO AI Prediction Service",
    description="Machine learning workload forecasting for healthcare workforce optimization",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request/Response Models ---
class DataPoint(BaseModel):
    date: str  # ISO format YYYY-MM-DD
    value: float = Field(ge=0, le=100)


class TrainRequest(BaseModel):
    data: list[DataPoint]
    granularity: str = Field(default="monthly", pattern="^(monthly|daily)$")
    model_complexity: str = Field(default="auto", pattern="^(auto|ridge|ensemble)$")


class PredictPointRequest(BaseModel):
    target_date: str
    granularity: str = "monthly"
    coefficients: list[float] = Field(default_factory=list)
    scale_params: Optional[dict] = None
    residual_std: float = 3.0
    last_index: int = 0
    last_date: Optional[str] = None
    model_artifact: Optional[str] = None
    model_type: Optional[str] = None
    training_values: Optional[list[float]] = None
    training_dates: Optional[list[str]] = None


class PredictPointResponse(BaseModel):
    predicted: float
    low: float
    high: float
    trend: str
    source: str


class PredictPointsRequest(BaseModel):
    """Batch variant of PredictPointRequest.

    All model context (artifact/coefficients/training data) is shared; only the
    target dates differ. This lets the backend build a whole trend/forecast
    series in a single round-trip instead of one HTTP call per point.
    """
    target_dates: list[str] = Field(default_factory=list)
    granularity: str = "monthly"
    coefficients: list[float] = Field(default_factory=list)
    scale_params: Optional[dict] = None
    residual_std: float = 3.0
    last_index: int = 0
    last_date: Optional[str] = None
    model_artifact: Optional[str] = None
    model_type: Optional[str] = None
    training_values: Optional[list[float]] = None
    training_dates: Optional[list[str]] = None


class PredictPointsResponse(BaseModel):
    points: list[PredictPointResponse]


class FeatureImportance(BaseModel):
    feature: str
    importance: float


class TrainResponse(BaseModel):
    mae: float
    rmse: float
    r2: float
    cv_mae: float
    baseline_naive_mae: float
    baseline_moving_avg_mae: float
    improvement_vs_naive: float
    feature_importance: list[FeatureImportance]
    coefficients: list[float]
    scale_params: dict[str, list[float]]
    residual_std: float
    last_index: int
    granularity: str
    model_type: str
    last_date: str
    training_points: int
    model_artifact: Optional[str] = None


class ForecastRequest(BaseModel):
    coefficients: list[float]
    last_index: int
    horizon: int = Field(ge=1, le=24, default=6)
    residual_std: float = Field(ge=0, default=3.0)
    scale_params: Optional[dict] = None


class ForecastPoint(BaseModel):
    month: str
    predicted: float
    low: float
    high: float


class ForecastResponse(BaseModel):
    forecast: list[ForecastPoint]


class SeriesDataPoint(BaseModel):
    date: str
    value: float = Field(ge=0, le=100)


class SeriesForecastRequest(BaseModel):
    data: list[SeriesDataPoint]
    target_date: str
    department: Optional[str] = None


class SeriesForecastResponse(BaseModel):
    predicted: float
    low: float
    high: float
    trend: str
    model_trained: bool
    source: str = "ridge-daily"


class AssigneeCandidate(BaseModel):
    id: str
    department_match: float = Field(ge=0, le=1, default=0.5)
    preference_match: float = Field(ge=0, le=1, default=0.5)
    wellness_score: float = Field(ge=0, le=1, default=0.5)
    rest_compliant: float = Field(ge=0, le=1, default=1.0)
    skill_match: float = Field(ge=0, le=1, default=0.5)
    hours_headroom: float = Field(ge=0, le=1, default=0.5)


class RankAssigneesRequest(BaseModel):
    candidates: list[AssigneeCandidate]
    shift_type: str = ""
    department: str = ""


class RankedAssignee(BaseModel):
    id: str
    score: float
    rank: int


class RankAssigneesResponse(BaseModel):
    rankings: list[RankedAssignee]
    weights_used: list[float]


class WellnessRiskRequest(BaseModel):
    overtime: float = Field(ge=0, default=0)
    wellness_score: float = Field(ge=0, le=100, default=75)
    weekly_hours: float = Field(ge=0, default=40)
    score_trend: float = Field(default=0)
    prior_risk: str = "low"
    overtime_warning: float = Field(ge=1, default=10)
    active_interventions: int = Field(ge=0, default=0)
    consecutive_night_shifts: int = Field(ge=0, default=0)
    shift_pattern_irregularity: float = Field(ge=0, le=1, default=0)


class WellnessRiskResponse(BaseModel):
    risk_level: str
    risk_probability: float
    predicted_score: float
    confidence: float
    top_factors: list[dict]
    feature_contributions: list[dict] = Field(default_factory=list)
    explainability: dict = Field(default_factory=dict)
    source: str


class WellnessInterventionRequest(BaseModel):
    risk_level: str = "low"
    overtime: float = Field(ge=0, default=0)
    wellness_score: float = Field(ge=0, le=100, default=75)
    active_interventions: int = Field(ge=0, default=0)
    department: str = ""
    available_types: Optional[list[str]] = None


class WellnessInterventionResponse(BaseModel):
    recommendations: list[dict]
    top_pick: Optional[str]
    source: str


class WellnessFeedbackRequest(BaseModel):
    message: str = ""
    rating: Optional[int] = Field(default=None, ge=1, le=5)


class WellnessFeedbackResponse(BaseModel):
    sentiment: str
    urgency: str
    themes: list[str]
    sentiment_score: float
    source: str


class InventoryMovementPoint(BaseModel):
    type: str = ""
    quantity: float = Field(ge=0, default=0)
    created_at: Optional[str] = None


class InventoryDemandRequest(BaseModel):
    movements: list[InventoryMovementPoint] = Field(default_factory=list)
    free_stock: float = Field(ge=0, default=0)
    in_use: float = Field(ge=0, default=0)
    horizon_weeks: int = Field(ge=1, le=8, default=4)
    lead_time_days: int = Field(ge=1, le=90, default=7)


class InventoryDemandResponse(BaseModel):
    weekly_demand: float
    daily_demand: float
    horizon_weeks: int
    confidence: float
    trend: str
    days_until_stockout: Optional[int] = None
    source: str
    history_weeks: int = 0


class InventoryReorderItem(BaseModel):
    resource_id: str = ""
    name: str = ""
    free_stock: float = Field(ge=0, default=0)
    reorder_level: float = Field(ge=0, default=5)
    available: float = Field(ge=0, default=0)
    in_use: float = Field(ge=0, default=0)
    unit_cost: float = Field(ge=0, default=0)
    weekly_demand: float = Field(ge=0, default=0)
    lead_time_days: int = Field(ge=1, default=7)
    critical: bool = False
    days_until_stockout: Optional[int] = None
    movements: list[InventoryMovementPoint] = Field(default_factory=list)


class InventoryOptimizeRequest(BaseModel):
    items: list[InventoryReorderItem] = Field(default_factory=list)
    lead_time_days: int = Field(ge=1, le=90, default=7)


class InventoryReorderResult(BaseModel):
    resource_id: str
    suggested_quantity: int
    priority: str
    priority_score: float
    weekly_demand: float
    days_of_cover: Optional[int] = None
    estimated_cost: int
    rationale: str
    source: str


class InventoryOptimizeResponse(BaseModel):
    suggestions: list[InventoryReorderResult]
    source: str = "inventory-ai"


class InventoryPortfolioItem(BaseModel):
    resource_id: str = ""
    name: str = ""
    free_stock: float = 0
    in_use: float = 0
    reorder_level: float = 5
    available: float = 0
    unit_cost: float = 0
    critical: bool = False
    movements: list[InventoryMovementPoint] = Field(default_factory=list)


class InventoryPortfolioRequest(BaseModel):
    items: list[InventoryPortfolioItem] = Field(default_factory=list)
    lead_time_days: int = Field(ge=1, le=90, default=7)


class InventoryPortfolioResponse(BaseModel):
    at_risk_count: int
    forecast_weekly_spend: int
    avg_confidence: float
    top_risks: list[dict]
    source: str


class ProcurementRankItem(BaseModel):
    id: str
    priority: str = "medium"
    status: str = "pending"
    quantity: float = 1
    estimated_total: float = 0


class ProcurementRankRequest(BaseModel):
    requests: list[ProcurementRankItem] = Field(default_factory=list)


class ProcurementRankResponse(BaseModel):
    rankings: list[dict]
    source: str = "inventory-ranker"


class SkillsTrainingItem(BaseModel):
    id: Optional[str] = None
    certification: Optional[str] = None
    cert_name: Optional[str] = None
    department: str = ""
    staff_count: int = Field(ge=0, default=1)
    staffCount: Optional[int] = None
    gap_type: str = "renewal"
    gapType: Optional[str] = None
    coverage_percent: float = Field(ge=0, le=100, default=100)
    coveragePercent: Optional[float] = None
    days_to_expiry: Optional[int] = None
    daysToExpiry: Optional[int] = None
    description: str = ""


class SkillsPrioritizeRequest(BaseModel):
    items: list[SkillsTrainingItem] = Field(default_factory=list)


class SkillsPrioritizeResponse(BaseModel):
    rankings: list[dict]
    source: str = "skills-ai"


class SkillsDeptGap(BaseModel):
    name: str = ""
    department: str = ""
    required_certs: list[str] = Field(default_factory=list)
    requiredCerts: Optional[list[str]] = None
    staff_total: int = 0
    staffTotal: Optional[int] = None
    qualified_staff: int = 0
    qualifiedStaff: Optional[int] = None
    missing_breakdown: list[dict] = Field(default_factory=list)
    missingBreakdown: Optional[list[dict]] = None


class SkillsAnalyzeGapsRequest(BaseModel):
    departments: list[SkillsDeptGap] = Field(default_factory=list)


class SkillsAnalyzeGapsResponse(BaseModel):
    gaps: list[dict]
    avg_coverage: float
    at_risk_departments: int
    source: str


class SkillsDevelopmentRequest(BaseModel):
    staffId: Optional[str] = None
    role: str = ""
    department: str = ""
    cert_count: int = Field(ge=0, default=0)
    certCount: Optional[int] = None
    expiring_count: int = Field(ge=0, default=0)
    expiringCount: Optional[int] = None
    skill_gaps: list[str] = Field(default_factory=list)
    skillGaps: Optional[list[str]] = None


class SkillsDevelopmentResponse(BaseModel):
    recommendations: list[dict]
    top_pick: Optional[str] = None
    source: str


# --- ML Logic ---
MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@app.get("/health")
def health():
    return {"status": "ok", "service": "hwo-ai"}


@app.post("/train", response_model=TrainResponse)
def train(req: TrainRequest):
    if len(req.data) < 8:
        raise HTTPException(400, "Need at least 8 data points")
    values = np.array([d.value for d in req.data])
    dates = [datetime.fromisoformat(d.date[:10]) for d in req.data]
    try:
        result = train_workload_model(values, dates, req.granularity, req.model_complexity)
        return TrainResponse(
            mae=result["mae"],
            rmse=result["rmse"],
            r2=result["r2"],
            cv_mae=result["cv_mae"],
            baseline_naive_mae=result["baseline_naive_mae"],
            baseline_moving_avg_mae=result["baseline_moving_avg_mae"],
            improvement_vs_naive=result["improvement_vs_naive"],
            feature_importance=result["feature_importance"],
            coefficients=result["coefficients"],
            scale_params=result["scale_params"],
            residual_std=result["residual_std"],
            last_index=len(values) - 1,
            granularity=result["granularity"],
            model_type=result["model_type"],
            last_date=result["last_date"],
            training_points=result["training_points"],
            model_artifact=result.get("model_artifact"),
        )
    except Exception as e:
        raise HTTPException(500, str(e))


def _predict_point_from_coefficients(
    target: datetime,
    granularity: str,
    coefficients: list[float],
    scale_params: Optional[dict],
    residual_std: float,
    last_index: int,
    last_date: Optional[str],
) -> dict:
    if len(coefficients) != 4:
        raise HTTPException(400, "Expected 4 coefficients or model_artifact")
    coefs = np.array(coefficients)
    if granularity == "daily":
        if not last_date:
            raise HTTPException(400, "last_date required for daily models")
        last = datetime.fromisoformat(last_date[:10]).date()
        days_ahead = max(0, (target.date() - last).days)
        pred_idx = last_index + days_ahead
        target_dow = target.weekday()
        x = np.array([1, pred_idx, np.sin(2 * np.pi * target_dow / 7), np.cos(2 * np.pi * target_dow / 7)])
        source = "ridge-daily"
    else:
        month_idx = target.month - 1
        pred_idx = last_index + 1
        x = np.array([1, pred_idx, np.sin(2 * np.pi * month_idx / 12), np.cos(2 * np.pi * month_idx / 12)])
        source = "ridge-monthly"

    if scale_params:
        mean = np.array(scale_params.get("mean", [0] * 4))
        std = np.array(scale_params.get("std", [1] * 4))
        x = (x - mean) / np.maximum(std, 1e-8)
        x[0] = 1
    pred = float(np.dot(x, coefs))
    pred = max(0, min(100, pred))
    days_ahead = 0
    if granularity == "daily" and last_date:
        days_ahead = max(0, (target.date() - datetime.fromisoformat(last_date[:10]).date()).days)
    margin = 1.96 * residual_std * np.sqrt(1 + days_ahead * 0.08)
    return {
        "predicted": round(pred, 1),
        "low": round(max(0, pred - margin), 1),
        "high": round(min(100, pred + margin), 1),
        "trend": "stable",
        "source": source,
    }


@app.post("/predict-point", response_model=PredictPointResponse)
def predict_point(req: PredictPointRequest):
    try:
        target = datetime.fromisoformat(req.target_date[:10])
        if req.model_artifact and req.training_values and req.training_dates:
            values = np.array(req.training_values, dtype=float)
            dates = [datetime.fromisoformat(d[:10]) for d in req.training_dates]
            out = predict_from_artifact(
                req.model_artifact, values, dates, target, req.granularity, req.residual_std
            )
            return PredictPointResponse(**out)

        out = _predict_point_from_coefficients(
            target, req.granularity, req.coefficients, req.scale_params,
            req.residual_std, req.last_index, req.last_date,
        )
        return PredictPointResponse(**out)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/predict-points", response_model=PredictPointsResponse)
def predict_points(req: PredictPointsRequest):
    """Predict many target dates in one request.

    For artifact-backed models the (large) joblib artifact is deserialized once
    and reused for every target, replacing the previous N-HTTP-calls pattern.
    """
    try:
        points: list[PredictPointResponse] = []
        use_artifact = bool(req.model_artifact and req.training_values and req.training_dates)
        artifact = None
        values = None
        dates = None
        if use_artifact:
            values = np.array(req.training_values, dtype=float)
            dates = [datetime.fromisoformat(d[:10]) for d in req.training_dates]
            artifact = deserialize_artifact(req.model_artifact)

        for target_date in req.target_dates:
            target = datetime.fromisoformat(target_date[:10])
            if use_artifact:
                out = predict_from_artifact_obj(
                    artifact, values, dates, target, req.granularity, req.residual_std
                )
            else:
                out = _predict_point_from_coefficients(
                    target, req.granularity, req.coefficients, req.scale_params,
                    req.residual_std, req.last_index, req.last_date,
                )
            points.append(PredictPointResponse(**out))
        return PredictPointsResponse(points=points)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    coefs = np.array(req.coefficients)
    if len(coefs) != 4:
        raise HTTPException(400, "Expected 4 coefficients")
    z = 1.96
    forecast_list = []
    for i in range(1, req.horizon + 1):
        t = req.last_index + i
        month_idx = t % 12
        x = np.array([
            1,
            t,
            np.sin(2 * np.pi * month_idx / 12),
            np.cos(2 * np.pi * month_idx / 12),
        ])
        if req.scale_params:
            mean = np.array(req.scale_params.get("mean", [0] * 4))
            std = np.array(req.scale_params.get("std", [1] * 4))
            x = (x - mean) / np.maximum(std, 1e-8)
            x[0] = 1
        pred = float(np.dot(x, coefs))
        pred = max(0, min(100, pred))
        margin = z * req.residual_std * np.sqrt(1 + i * 0.15)
        forecast_list.append(
            ForecastPoint(
                month=MONTH_NAMES[month_idx],
                predicted=round(pred, 1),
                low=round(max(0, pred - margin), 1),
                high=round(min(100, pred + margin), 1),
            )
        )
    return ForecastResponse(forecast=forecast_list)


RANKING_WEIGHTS = [0.20, 0.15, 0.20, 0.15, 0.20, 0.10]


@app.post("/forecast-series", response_model=SeriesForecastResponse)
def forecast_series(req: SeriesForecastRequest):
    if len(req.data) < 8:
        raise HTTPException(400, "Need at least 8 data points")
    try:
        values = np.array([d.value for d in req.data])
        dates = [datetime.fromisoformat(d.date[:10]) for d in req.data]
        target = datetime.fromisoformat(req.target_date[:10])
        trained = train_workload_model(values, dates, "daily", "auto")
        if trained.get("model_artifact"):
            out = predict_from_artifact(
                trained["model_artifact"], values, dates, target, "daily", trained["residual_std"]
            )
            return SeriesForecastResponse(
                predicted=out["predicted"],
                low=out["low"],
                high=out["high"],
                trend=out["trend"],
                model_trained=True,
                source=out["source"],
            )
        raise HTTPException(500, "Failed to build forecast model")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/wellness/model-info")
def wellness_model_info():
    return get_burnout_model_info()


@app.post("/wellness/predict-risk", response_model=WellnessRiskResponse)
def wellness_predict_risk(req: WellnessRiskRequest):
    try:
        return WellnessRiskResponse(**predict_burnout_risk(req.model_dump()))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/wellness/recommend-interventions", response_model=WellnessInterventionResponse)
def wellness_recommend_interventions(req: WellnessInterventionRequest):
    try:
        return WellnessInterventionResponse(**recommend_interventions(req.model_dump()))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/wellness/analyze-feedback", response_model=WellnessFeedbackResponse)
def wellness_analyze_feedback(req: WellnessFeedbackRequest):
    try:
        return WellnessFeedbackResponse(**analyze_feedback_sentiment(req.message, req.rating))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/inventory/predict-demand", response_model=InventoryDemandResponse)
def inventory_predict_demand(req: InventoryDemandRequest):
    try:
        payload = req.model_dump()
        payload["movements"] = [m.model_dump() for m in req.movements]
        return InventoryDemandResponse(**predict_demand(payload))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/inventory/optimize-reorders", response_model=InventoryOptimizeResponse)
def inventory_optimize_reorders(req: InventoryOptimizeRequest):
    try:
        items = []
        for item in req.items:
            row = item.model_dump()
            row["movements"] = [m.model_dump() for m in item.movements]
            if row.get("weekly_demand", 0) <= 0 and row.get("movements"):
                demand = predict_demand({
                    "movements": row["movements"],
                    "free_stock": row.get("free_stock", 0),
                    "in_use": row.get("in_use", 0),
                    "lead_time_days": req.lead_time_days,
                })
                row["weekly_demand"] = demand["weekly_demand"]
                row["days_until_stockout"] = demand.get("days_until_stockout")
            row["lead_time_days"] = req.lead_time_days
            items.append(row)
        suggestions = optimize_reorders(items)
        return InventoryOptimizeResponse(suggestions=suggestions, source="inventory-ai")
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/inventory/analyze-portfolio", response_model=InventoryPortfolioResponse)
def inventory_analyze_portfolio(req: InventoryPortfolioRequest):
    try:
        items = []
        for item in req.items:
            row = item.model_dump()
            row["movements"] = [m.model_dump() for m in item.movements]
            items.append(row)
        return InventoryPortfolioResponse(**analyze_inventory_portfolio(items, req.lead_time_days))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/inventory/rank-procurement", response_model=ProcurementRankResponse)
def inventory_rank_procurement(req: ProcurementRankRequest):
    try:
        rankings = rank_procurement([r.model_dump() for r in req.requests])
        return ProcurementRankResponse(rankings=rankings)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/skills/prioritize-training", response_model=SkillsPrioritizeResponse)
def skills_prioritize_training(req: SkillsPrioritizeRequest):
    try:
        items = [item.model_dump() for item in req.items]
        rankings = prioritize_training(items)
        return SkillsPrioritizeResponse(rankings=rankings, source="skills-ai")
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/skills/analyze-gaps", response_model=SkillsAnalyzeGapsResponse)
def skills_analyze_gaps(req: SkillsAnalyzeGapsRequest):
    try:
        departments = [d.model_dump() for d in req.departments]
        return SkillsAnalyzeGapsResponse(**analyze_department_gaps(departments))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/skills/recommend-development", response_model=SkillsDevelopmentResponse)
def skills_recommend_development(req: SkillsDevelopmentRequest):
    try:
        return SkillsDevelopmentResponse(**recommend_development(req.model_dump()))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/rank-assignees", response_model=RankAssigneesResponse)
def rank_assignees(req: RankAssigneesRequest):
    if not req.candidates:
        raise HTTPException(400, "At least one candidate required")

    weights = np.array(RANKING_WEIGHTS)
    if req.shift_type.lower() == "night":
        weights = weights * np.array([1.0, 1.0, 1.2, 1.3, 1.1, 1.0])
    dept_lower = req.department.lower()
    if "icu" in dept_lower or "emergency" in dept_lower or "critical" in dept_lower:
        weights = weights * np.array([1.0, 1.0, 1.1, 1.0, 1.4, 1.0])
    weights = weights / weights.sum()

    scored = []
    for candidate in req.candidates:
        features = np.array([
            candidate.department_match,
            candidate.preference_match,
            candidate.wellness_score,
            candidate.rest_compliant,
            candidate.skill_match,
            candidate.hours_headroom,
        ])
        score = float(np.dot(features, weights) * 100)
        scored.append((candidate.id, round(score, 1)))

    scored.sort(key=lambda item: item[1], reverse=True)
    rankings = [
        RankedAssignee(id=staff_id, score=score, rank=index + 1)
        for index, (staff_id, score) in enumerate(scored)
    ]
    return RankAssigneesResponse(
        rankings=rankings,
        weights_used=[round(float(w), 4) for w in weights],
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
