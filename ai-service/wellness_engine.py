"""Wellness AI: explainable burnout risk prediction, intervention ranking, feedback sentiment."""
from __future__ import annotations

import re
from typing import Any

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

INTERVENTION_TYPES = [
    "Reduce overtime",
    "Wellness check-in",
    "Peer support",
    "Schedule adjustment",
    "Mental health referral",
]

FEATURE_LABELS = [
    "Overtime hours",
    "Wellness score",
    "Weekly hours",
    "Score trend (30d)",
    "Prior risk level",
    "Overtime warning threshold",
    "Active interventions",
    "Overtime ratio",
    "Hours above standard",
    "Low score flag",
    "Consecutive night shifts",
    "Shift pattern irregularity",
]

NEGATIVE_WORDS = {
    "burnout", "exhausted", "overwhelmed", "stress", "stressed", "tired", "understaffed",
    "unfair", "anxious", "depressed", "quit", "leaving", "unsustainable", "toxic",
    "nightmare", "impossible", "breaking", "crying", "hopeless",
}
POSITIVE_WORDS = {
    "supported", "grateful", "thank", "great", "good", "happy", "team", "balance",
    "improving", "better", "helpful", "appreciate", "wellness", "manageable",
}
URGENCY_WORDS = {
    "urgent", "immediately", "asap", "critical", "emergency", "cannot", "can't",
    "help", "crisis", "danger", "unsafe",
}
THEME_KEYWORDS = {
    "workload": {"overtime", "hours", "shifts", "understaffed", "workload", "busy"},
    "support": {"support", "team", "manager", "leadership", "communication"},
    "work_life": {"balance", "family", "personal", "rest", "sleep"},
    "mental_health": {"stress", "anxiety", "depression", "mental", "burnout", "counseling"},
    "scheduling": {"schedule", "rotation", "night", "weekend", "on-call"},
}

FACTOR_ACTIONS = {
    "Excessive overtime": "Reduce overtime assignments and cap weekly hours",
    "Low wellness score": "Conduct manager wellness review and schedule check-in",
    "Declining wellness trend": "Review recent schedule changes and workload drivers",
    "Consecutive night shifts": "Insert recovery days and rotate off night rotation",
    "Elevated weekly hours": "Rebalance shift allocation across the team",
    "Irregular shift pattern": "Stabilize schedule with predictable rotation",
    "Prior elevated risk": "Continue monitoring and maintain active interventions",
    "Multiple active interventions": "Evaluate intervention effectiveness in follow-up",
}


def _risk_label(prob: float) -> str:
    if prob >= 0.65:
        return "high"
    if prob >= 0.38:
        return "medium"
    return "low"


def _build_risk_features(payload: dict[str, Any]) -> np.ndarray:
    overtime = float(payload.get("overtime", 0))
    score = float(payload.get("wellness_score", 75))
    weekly_hours = float(payload.get("weekly_hours", 40 + overtime))
    score_trend = float(payload.get("score_trend", 0))
    prior = str(payload.get("prior_risk", "low")).lower()
    prior_enc = {"low": 0.0, "medium": 1.0, "high": 2.0}.get(prior, 0.0)
    warning = float(payload.get("overtime_warning", 10))
    active_interventions = float(payload.get("active_interventions", 0))
    consecutive_nights = float(payload.get("consecutive_night_shifts", 0))
    shift_irregularity = float(payload.get("shift_pattern_irregularity", 0))
    return np.array([[
        overtime,
        score,
        weekly_hours,
        score_trend,
        prior_enc,
        warning,
        active_interventions,
        overtime / max(1.0, warning),
        max(0.0, weekly_hours - 40.0),
        1.0 if score < 60 else 0.0,
        consecutive_nights,
        shift_irregularity,
    ]], dtype=float)


def _synthetic_risk_training(n: int = 480) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(42)
    rows = []
    labels = []
    for _ in range(n):
        overtime = float(rng.uniform(0, 20))
        score = float(rng.uniform(40, 95))
        weekly = float(40 + overtime + rng.uniform(-2, 6))
        trend = float(rng.uniform(-15, 10))
        prior = float(rng.choice([0, 1, 2]))
        warning = 10.0
        active = float(rng.integers(0, 4))
        nights = float(rng.integers(0, 6))
        irregular = float(rng.uniform(0, 1))
        row = [
            overtime, score, weekly, trend, prior, warning, active,
            overtime / warning, max(0.0, weekly - 40.0), 1.0 if score < 60 else 0.0,
            nights, irregular,
        ]
        prob = (
            0.06
            + 0.035 * overtime
            + 0.025 * max(0, weekly - 42)
            + 0.02 * prior
            + 0.012 * active
            + 0.03 * nights
            + 0.015 * irregular
            - 0.018 * max(0, trend)
            - 0.014 * max(0, score - 70)
        )
        prob = float(np.clip(prob, 0.05, 0.95))
        label = 1 if prob >= 0.5 else 0
        rows.append(row)
        labels.append(label)
    return np.array(rows, dtype=float), np.array(labels, dtype=int)


_RISK_MODEL: HistGradientBoostingClassifier | None = None
_RISK_SCALER: StandardScaler | None = None
_MODEL_METRICS: dict[str, Any] | None = None


def _ensure_risk_model() -> tuple[HistGradientBoostingClassifier, StandardScaler]:
    global _RISK_MODEL, _RISK_SCALER, _MODEL_METRICS
    if _RISK_MODEL is None or _RISK_SCALER is None:
        x, y = _synthetic_risk_training()
        x_train, x_test, y_train, y_test = train_test_split(
            x, y, test_size=0.25, random_state=42, stratify=y
        )
        scaler = StandardScaler()
        x_train_s = scaler.fit_transform(x_train)
        x_test_s = scaler.transform(x_test)
        model = HistGradientBoostingClassifier(
            max_depth=5,
            learning_rate=0.1,
            max_iter=150,
            random_state=42,
        )
        model.fit(x_train_s, y_train)
        y_pred = model.predict(x_test_s)
        y_prob = model.predict_proba(x_test_s)[:, 1]
        _MODEL_METRICS = {
            "algorithm": "HistGradientBoostingClassifier",
            "framework": "scikit-learn",
            "training_samples": int(len(x_train)),
            "validation_samples": int(len(x_test)),
            "accuracy": round(float(accuracy_score(y_test, y_pred)), 3),
            "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 3),
            "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 3),
            "f1_score": round(float(f1_score(y_test, y_pred, zero_division=0)), 3),
            "roc_auc": round(float(roc_auc_score(y_test, y_prob)), 3),
            "feature_count": len(FEATURE_LABELS),
            "explainability": "Permutation-weighted feature contributions + rule-based factor mapping",
        }
        _RISK_MODEL = model
        _RISK_SCALER = scaler
    return _RISK_MODEL, _RISK_SCALER


def get_burnout_model_info() -> dict[str, Any]:
    _ensure_risk_model()
    return {
        "model_name": "HWO Burnout Risk Classifier",
        "purpose": "Predict high burnout risk from workload, schedule, and wellness indicators",
        "metrics": _MODEL_METRICS or {},
        "features": FEATURE_LABELS,
        "risk_thresholds": {"high": 0.65, "medium": 0.38, "low": 0.0},
        "source": "gbm-wellness",
    }


def _permutation_contributions(model, x_scaled: np.ndarray, base_prob: float) -> list[dict[str, Any]]:
    """Approximate SHAP-style contributions by feature ablation on probability."""
    contribs: list[tuple[str, float]] = []
    for idx, label in enumerate(FEATURE_LABELS):
        modified = x_scaled.copy()
        modified[0, idx] = 0.0
        alt_prob = float(model.predict_proba(modified)[0][1])
        delta = base_prob - alt_prob
        if abs(delta) > 0.001:
            contribs.append((label, delta))
    if not contribs:
        return [{"factor": "Stable indicators", "contribution_pct": 100.0, "direction": "neutral"}]
    total = sum(abs(v) for _, v in contribs) or 1.0
    contribs.sort(key=lambda item: abs(item[1]), reverse=True)
    return [
        {
            "factor": name,
            "contribution_pct": round(abs(delta) / total * 100, 1),
            "direction": "increases_risk" if delta > 0 else "decreases_risk",
        }
        for name, delta in contribs[:5]
    ]


def _human_factors(payload: dict[str, Any], ml_contribs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map ML + domain rules to user-readable risk factors with percentage weights."""
    factors: list[tuple[str, float]] = []
    overtime = float(payload.get("overtime", 0))
    score = float(payload.get("wellness_score", 75))
    warning = float(payload.get("overtime_warning", 10))
    nights = float(payload.get("consecutive_night_shifts", 0))
    weekly = float(payload.get("weekly_hours", 40))
    trend = float(payload.get("score_trend", 0))
    irregular = float(payload.get("shift_pattern_irregularity", 0))

    if overtime >= warning:
        factors.append(("Excessive overtime", min(1.0, overtime / 20) * 0.35))
    if score < 65:
        factors.append(("Low wellness score", ((65 - score) / 65) * 0.25))
    if trend < -5:
        factors.append(("Declining wellness trend", min(1.0, abs(trend) / 15) * 0.15))
    if nights >= 3:
        factors.append(("Consecutive night shifts", min(1.0, nights / 5) * 0.25))
    if weekly > 48:
        factors.append(("Elevated weekly hours", min(1.0, (weekly - 40) / 20) * 0.20))
    if irregular >= 0.5:
        factors.append(("Irregular shift pattern", irregular * 0.15))

    for item in ml_contribs:
        if item.get("direction") == "increases_risk" and item.get("contribution_pct", 0) >= 8:
            label = str(item.get("factor", ""))
            if not any(f[0] == label for f in factors):
                factors.append((label, item["contribution_pct"] / 100 * 0.12))

    if not factors:
        factors.append(("Stable indicators", 0.1))

    total = sum(w for _, w in factors) or 1.0
    return [
        {
            "factor": name,
            "weight": round(weight / total, 3),
            "contribution_pct": round(weight / total * 100, 1),
            "recommended_action": FACTOR_ACTIONS.get(name, "Monitor and reassess in 7 days"),
        }
        for name, weight in sorted(factors, key=lambda x: x[1], reverse=True)[:4]
    ]


def predict_burnout_risk(payload: dict[str, Any]) -> dict[str, Any]:
    model, scaler = _ensure_risk_model()
    x = _build_risk_features(payload)
    x_s = scaler.transform(x)
    prob = float(model.predict_proba(x_s)[0][1])
    risk = _risk_label(prob)
    predicted_score = round(
        max(0, min(100, 100 - prob * 55 - float(payload.get("overtime", 0)) * 1.2)), 1
    )

    ml_contribs = _permutation_contributions(model, x_s, prob)
    top_factors = _human_factors(payload, ml_contribs)
    primary_action = top_factors[0]["recommended_action"] if top_factors else "Schedule wellness check-in"

    why_flagged = (
        f"Burnout risk classified as {risk.upper()} ({prob * 100:.0f}% probability) based on "
        + ", ".join(f"{f['factor']} (+{f['contribution_pct']:.0f}%)" for f in top_factors[:3])
        + "."
    )

    return {
        "risk_level": risk,
        "risk_probability": round(prob, 3),
        "predicted_score": predicted_score,
        "confidence": round(0.55 + min(0.4, abs(prob - 0.5)), 3),
        "top_factors": top_factors,
        "feature_contributions": ml_contribs,
        "explainability": {
            "why_flagged": why_flagged,
            "contributing_factors": top_factors,
            "recommended_action": primary_action,
            "model_metrics": _MODEL_METRICS,
            "methodology": (
                "HistGradientBoostingClassifier trained on workload/wellness features. "
                "Contributions estimated via feature ablation (SHAP-style approximation). "
                "Domain rules overlay schedule patterns (night shifts, weekly hours)."
            ),
        },
        "source": "gbm-wellness",
    }


def recommend_interventions(payload: dict[str, Any]) -> dict[str, Any]:
    risk = str(payload.get("risk_level", "low")).lower()
    overtime = float(payload.get("overtime", 0))
    score = float(payload.get("wellness_score", 75))
    active = int(payload.get("active_interventions", 0))
    dept = str(payload.get("department", "")).lower()
    nights = float(payload.get("consecutive_night_shifts", 0))
    types = payload.get("available_types") or INTERVENTION_TYPES

    scores: list[tuple[str, float, str]] = []
    for intervention in types:
        base = 0.35
        reason = "General wellness maintenance"
        if intervention == "Reduce overtime":
            base += min(0.45, overtime / 25)
            reason = "High overtime hours detected — primary burnout driver"
        elif intervention == "Wellness check-in":
            base += 0.25 if score < 70 else 0.1
            reason = "Score suggests follow-up conversation with manager"
        elif intervention == "Peer support":
            base += 0.2 if risk == "medium" else 0.1
            reason = "Peer support helps moderate risk and reduces isolation"
        elif intervention == "Schedule adjustment":
            base += 0.3 if overtime >= 8 or nights >= 3 else 0.12
            if "icu" in dept or "emergency" in dept:
                base += 0.1
            reason = "Schedule load or night rotation may be unsustainable"
        elif intervention == "Mental health referral":
            base += 0.5 if risk == "high" else (0.2 if risk == "medium" else 0.05)
            if score < 55:
                base += 0.15
            reason = "Risk level warrants professional support pathway"
        if active >= 2 and intervention != "Wellness check-in":
            base *= 0.85
        scores.append((intervention, min(0.99, base), reason))

    scores.sort(key=lambda item: item[1], reverse=True)
    recommendations = [
        {
            "type": name,
            "score": round(score_val * 100, 1),
            "rank": idx + 1,
            "rationale": rationale,
        }
        for idx, (name, score_val, rationale) in enumerate(scores)
    ]
    return {
        "recommendations": recommendations,
        "top_pick": recommendations[0]["type"] if recommendations else None,
        "source": "wellness-ranker",
    }


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z']+", text.lower()))


def analyze_feedback_sentiment(message: str, rating: int | None = None) -> dict[str, Any]:
    tokens = _tokenize(message or "")
    neg = len(tokens & NEGATIVE_WORDS)
    pos = len(tokens & POSITIVE_WORDS)
    urg = len(tokens & URGENCY_WORDS)

    text_score = (pos - neg) / max(1, pos + neg + 1)
    if rating is not None:
        text_score = 0.6 * text_score + 0.4 * ((rating - 3) / 2)

    if text_score > 0.15:
        sentiment = "positive"
    elif text_score < -0.15:
        sentiment = "negative"
    else:
        sentiment = "neutral"

    urgency = "high" if urg >= 2 or (sentiment == "negative" and neg >= 3) else (
        "medium" if urg >= 1 or sentiment == "negative" else "low"
    )

    themes = []
    for theme, keywords in THEME_KEYWORDS.items():
        if tokens & keywords:
            themes.append(theme)
    if not themes:
        themes = ["general"]

    return {
        "sentiment": sentiment,
        "urgency": urgency,
        "themes": themes,
        "sentiment_score": round(text_score, 3),
        "source": "lexicon-wellness",
    }
