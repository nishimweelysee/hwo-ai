"""Advanced workload forecasting: rich features, ensemble models, serialized artifacts."""
from __future__ import annotations

import base64
import io
from datetime import datetime
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

FEATURE_NAMES_DAILY = [
    "time_index",
    "dow_sin",
    "dow_cos",
    "month_sin",
    "month_cos",
    "is_weekend",
    "lag_1",
    "lag_7",
    "lag_14",
    "roll_mean_7",
    "roll_std_7",
    "ewma_7",
]
FEATURE_NAMES_MONTHLY = [
    "time_index",
    "month_sin",
    "month_cos",
    "lag_1",
    "lag_3",
    "roll_mean_3",
    "roll_std_3",
]


def _rolling(values: np.ndarray, window: int, idx: int, fn) -> float:
    start = max(0, idx - window)
    chunk = values[start:idx]
    if len(chunk) == 0:
        return float(values[idx - 1]) if idx > 0 else float(values[0])
    return float(fn(chunk))


def _ewma(values: np.ndarray, idx: int, alpha: float = 0.35) -> float:
    start = max(0, idx - 6)
    chunk = values[start: idx + 1]
    if len(chunk) == 0:
        return 0.0
    ewma = float(chunk[0])
    for v in chunk[1:]:
        ewma = alpha * float(v) + (1 - alpha) * ewma
    return ewma


def build_features(values: np.ndarray, dates: list[datetime], granularity: str) -> np.ndarray:
    n = len(values)
    rows = []
    for i in range(n):
        d = dates[i]
        dow = d.weekday()
        month = d.month - 1
        if granularity == "daily":
            lag1 = values[i - 1] if i > 0 else values[i]
            lag7 = values[i - 7] if i >= 7 else lag1
            lag14 = values[i - 14] if i >= 14 else lag7
            rows.append([
                float(i),
                np.sin(2 * np.pi * dow / 7),
                np.cos(2 * np.pi * dow / 7),
                np.sin(2 * np.pi * month / 12),
                np.cos(2 * np.pi * month / 12),
                1.0 if dow >= 5 else 0.0,
                float(lag1),
                float(lag7),
                float(lag14),
                _rolling(values, 7, i, np.mean),
                _rolling(values, 7, i, np.std),
                _ewma(values, i),
            ])
        else:
            lag1 = values[i - 1] if i > 0 else values[i]
            lag3 = values[i - 3] if i >= 3 else lag1
            rows.append([
                float(i),
                np.sin(2 * np.pi * month / 12),
                np.cos(2 * np.pi * month / 12),
                float(lag1),
                float(lag3),
                _rolling(values, 3, i, np.mean),
                _rolling(values, 3, i, np.std),
            ])
    return np.array(rows, dtype=float)


def build_target_features(
    values: np.ndarray,
    dates: list[datetime],
    target: datetime,
    granularity: str,
) -> np.ndarray:
    n = len(values)
    last = dates[-1]
    if granularity == "daily":
        days_ahead = max(0, (target.date() - last.date()).days)
        idx = n - 1 + days_ahead
        dow = target.weekday()
        month = target.month - 1
        lag1 = float(values[-1])
        lag7 = float(values[-7]) if len(values) >= 7 else lag1
        lag14 = float(values[-14]) if len(values) >= 14 else lag7
        extended = np.append(values, lag1)
        return np.array([[
            float(idx),
            np.sin(2 * np.pi * dow / 7),
            np.cos(2 * np.pi * dow / 7),
            np.sin(2 * np.pi * month / 12),
            np.cos(2 * np.pi * month / 12),
            1.0 if dow >= 5 else 0.0,
            lag1,
            lag7,
            lag14,
            _rolling(extended, 7, len(extended), np.mean),
            _rolling(extended, 7, len(extended), np.std),
            _ewma(extended, len(extended) - 1),
        ]], dtype=float)
    months_ahead = max(
        1,
        (target.year * 12 + target.month) - (last.year * 12 + last.month),
    )
    idx = n - 1 + months_ahead
    month = target.month - 1
    lag1 = float(values[-1])
    lag3 = float(values[-3]) if len(values) >= 3 else lag1
    extended = np.append(values, lag1)
    return np.array([[
        float(idx),
        np.sin(2 * np.pi * month / 12),
        np.cos(2 * np.pi * month / 12),
        lag1,
        lag3,
        _rolling(extended, 3, len(extended), np.mean),
        _rolling(extended, 3, len(extended), np.std),
    ]], dtype=float)


def _legacy_ridge_features(indices: np.ndarray, dates: list[datetime], granularity: str) -> np.ndarray:
    if granularity == "daily":
        dows = np.array([d.weekday() for d in dates])
        return np.column_stack([
            np.ones(len(indices)),
            indices,
            np.sin(2 * np.pi * dows / 7),
            np.cos(2 * np.pi * dows / 7),
        ])
    months = indices % 12
    return np.column_stack([
        np.ones(len(indices)),
        indices,
        np.sin(2 * np.pi * months / 12),
        np.cos(2 * np.pi * months / 12),
    ])


def _select_model_type(n: int, granularity: str, complexity: str) -> str:
    if complexity == "ridge":
        return "ridge-daily" if granularity == "daily" else "ridge-monthly"
    if complexity == "ensemble" or complexity == "auto":
        if granularity == "daily" and n >= 30:
            return "ensemble-daily"
        if granularity == "monthly" and n >= 12:
            return "ensemble-monthly"
    return "ridge-daily" if granularity == "daily" else "ridge-monthly"


def _tune_ensemble_weights(
    ridge_pred: np.ndarray,
    gbm_pred: np.ndarray,
    y_true: np.ndarray,
) -> tuple[float, float]:
    if len(y_true) == 0 or len(gbm_pred) == 0:
        return 0.35, 0.65
    best_w = 0.35
    best_mae = float("inf")
    for w in np.linspace(0.15, 0.55, 9):
        blend = w * ridge_pred + (1 - w) * gbm_pred
        mae = float(np.mean(np.abs(y_true - blend)))
        if mae < best_mae:
            best_mae = mae
            best_w = float(w)
    return best_w, 1.0 - best_w


def train_workload_model(
    values: np.ndarray,
    dates: list[datetime],
    granularity: str = "monthly",
    complexity: str = "auto",
) -> dict[str, Any]:
    n = len(values)
    if n < 8:
        raise ValueError("Need at least 8 data points")

    model_type = _select_model_type(n, granularity, complexity)
    X = build_features(values, dates, granularity)
    y = values.astype(float)
    split = max(6, int(n * 0.8))
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test) if len(X_test) else X_test

    ridge = Ridge(alpha=0.15).fit(X_train_s, y_train)
    ridge_pred = ridge.predict(X_test_s) if len(X_test) else np.array([])
    gbm: HistGradientBoostingRegressor | None = None
    gbm_pred = np.array([])

    use_ensemble = model_type.startswith("ensemble")
    if use_ensemble:
        gbm = HistGradientBoostingRegressor(
            max_depth=6,
            learning_rate=0.08,
            max_iter=200,
            l2_regularization=0.1,
            random_state=42,
        )
        gbm.fit(X_train, y_train)
        gbm_pred = gbm.predict(X_test) if len(X_test) else np.array([])

    def blended_pred(r_pred: np.ndarray, g_pred: np.ndarray, w_ridge: float, w_gbm: float) -> np.ndarray:
        if use_ensemble and len(g_pred):
            return w_ridge * r_pred + w_gbm * g_pred
        return r_pred

    ridge_w, gbm_w = 0.35, 0.65
    if use_ensemble and len(y_test) and len(gbm_pred):
        ridge_w, gbm_w = _tune_ensemble_weights(ridge_pred, gbm_pred, y_test)

    test_pred = blended_pred(ridge_pred, gbm_pred, ridge_w, gbm_w) if len(y_test) else np.array([])
    mae = float(np.mean(np.abs(y_test - test_pred))) if len(y_test) else 0.0
    rmse = float(np.sqrt(np.mean((y_test - test_pred) ** 2))) if len(y_test) else 0.0
    ss_res = float(np.sum((y_test - test_pred) ** 2)) if len(y_test) else 0.0
    ss_tot = float(np.sum((y_test - np.mean(y_test)) ** 2)) if len(y_test) else 0.0
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

    cv_errors: list[float] = []
    folds = min(5, max(2, n // 6))
    for fold in range(1, folds + 1):
        train_end = fold * max(2, n // (folds + 1))
        if train_end >= n - 2:
            break
        X_cv = build_features(values[:train_end], dates[:train_end], granularity)
        y_cv = values[:train_end]
        scaler_cv = StandardScaler()
        X_cv_s = scaler_cv.fit_transform(X_cv)
        m_cv = Ridge(alpha=0.15).fit(X_cv_s, y_cv)
        x_val = build_features(values[: train_end + 1], dates[: train_end + 1], granularity)[-1:]
        pred_val = m_cv.predict(scaler_cv.transform(x_val))[0]
        cv_errors.append(abs(values[train_end] - pred_val))
    cv_mae = float(np.mean(cv_errors)) if cv_errors else mae

    baseline_naive = float(np.mean(np.abs(y_test - values[split - 1]))) if len(y_test) else 0.0
    ma_errors = [
        abs(values[i] - np.mean(values[max(0, i - 3):i]))
        for i in range(split, n)
    ]
    baseline_ma = float(np.mean(ma_errors)) if ma_errors else 0.0
    improvement = 1 - mae / baseline_naive if baseline_naive > 0 else 0.0

    ridge_full = Ridge(alpha=0.15).fit(scaler.fit_transform(X), y)
    gbm_full = None
    if use_ensemble:
        gbm_full = HistGradientBoostingRegressor(
            max_depth=6,
            learning_rate=0.08,
            max_iter=200,
            l2_regularization=0.1,
            random_state=42,
        )
        gbm_full.fit(X, y)

    X_full_s = scaler.transform(X)
    full_pred = ridge_full.predict(X_full_s)
    if gbm_full is not None:
        full_pred = ridge_w * full_pred + gbm_w * gbm_full.predict(X)
    residuals = y - full_pred
    bias_correction = float(np.mean(residuals))
    residual_std = float(np.std(residuals)) if n > 4 else float(np.sqrt(np.sum(residuals**2) / max(1, n - 4)))
    residual_q90 = float(np.percentile(np.abs(residuals), 90)) if len(residuals) else residual_std

    legacy_X = _legacy_ridge_features(np.arange(n), dates, granularity)
    legacy_scaler = StandardScaler()
    legacy_X_s = legacy_scaler.fit_transform(legacy_X)
    legacy_X_s[:, 0] = 1
    legacy_ridge = Ridge(alpha=0.1).fit(legacy_X_s, y)
    coefs_out = [float(legacy_ridge.intercept_ + legacy_ridge.coef_[0])] + legacy_ridge.coef_[1:].tolist()

    importance = _feature_importance(ridge_full, gbm_full, granularity)

    artifact = {
        "model_type": model_type,
        "granularity": granularity,
        "ridge": ridge_full,
        "gbm": gbm_full,
        "scaler": scaler,
        "feature_names": FEATURE_NAMES_DAILY if granularity == "daily" else FEATURE_NAMES_MONTHLY,
        "training_values": values.tolist(),
        "training_dates": [d.date().isoformat() for d in dates],
        "ensemble_weights": {"ridge": round(ridge_w, 3), "gbm": round(gbm_w, 3)} if gbm_full else {"ridge": 1.0},
        "bias_correction": round(bias_correction, 4),
        "residual_q90": round(residual_q90, 2),
    }

    return {
        "coefficients": coefs_out,
        "scale_params": {
            "mean": legacy_scaler.mean_.tolist(),
            "std": legacy_scaler.scale_.tolist(),
        },
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "r2": round(r2, 4),
        "cv_mae": round(cv_mae, 2),
        "residual_std": round(residual_std, 2),
        "residual_q90": round(residual_q90, 2),
        "bias_correction": round(bias_correction, 4),
        "baseline_naive_mae": round(baseline_naive, 2),
        "baseline_moving_avg_mae": round(baseline_ma, 2),
        "improvement_vs_naive": round(improvement, 2),
        "feature_importance": importance,
        "granularity": granularity,
        "model_type": model_type,
        "last_date": dates[-1].date().isoformat(),
        "training_points": n,
        "model_artifact": serialize_artifact(artifact),
    }


def _feature_importance(ridge: Ridge, gbm: HistGradientBoostingRegressor | None, granularity: str) -> list[dict]:
    names = FEATURE_NAMES_DAILY if granularity == "daily" else FEATURE_NAMES_MONTHLY
    ridge_abs = np.abs(ridge.coef_)
    if gbm is not None and hasattr(gbm, "feature_importances_"):
        gbm_imp = gbm.feature_importances_
        combined = 0.35 * ridge_abs + 0.65 * gbm_imp
    else:
        combined = ridge_abs
    total = float(np.sum(combined)) or 1.0
    pairs = sorted(zip(names, combined), key=lambda p: p[1], reverse=True)
    return [{"feature": name, "importance": round(float(val / total), 4)} for name, val in pairs[:6]]


def serialize_artifact(artifact: dict[str, Any]) -> str:
    buffer = io.BytesIO()
    joblib.dump(artifact, buffer)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def deserialize_artifact(encoded: str) -> dict[str, Any]:
    raw = base64.b64decode(encoded.encode("ascii"))
    return joblib.load(io.BytesIO(raw))


def predict_from_artifact(
    artifact_b64: str,
    values: np.ndarray,
    dates: list[datetime],
    target: datetime,
    granularity: str,
    residual_std: float,
) -> dict[str, Any]:
    artifact = deserialize_artifact(artifact_b64)
    x = build_target_features(values, dates, target, granularity)
    ridge = artifact["ridge"]
    scaler = artifact["scaler"]
    weights = artifact.get("ensemble_weights", {"ridge": 0.35, "gbm": 0.65})
    w_ridge = float(weights.get("ridge", 0.35))
    w_gbm = float(weights.get("gbm", 0.65))
    pred = float(ridge.predict(scaler.transform(x))[0])
    gbm = artifact.get("gbm")
    if gbm is not None:
        pred = w_ridge * pred + w_gbm * float(gbm.predict(x)[0])
    bias = float(artifact.get("bias_correction", 0.0))
    pred = pred + bias
    pred = max(0.0, min(100.0, pred))
    days_ahead = max(0, (target.date() - dates[-1].date()).days) if granularity == "daily" else 1
    q90 = float(artifact.get("residual_q90", residual_std))
    margin = max(1.96 * residual_std, q90) * np.sqrt(1 + days_ahead * 0.05)
    recent = values[-7:] if len(values) >= 7 else values
    prior = values[-14:-7] if len(values) >= 14 else values[: max(1, len(values) // 2)]
    trend = "stable"
    if len(prior) and np.mean(prior) > 0:
        change = (float(np.mean(recent)) - float(np.mean(prior))) / float(np.mean(prior))
        if change > 0.08:
            trend = "rising"
        elif change < -0.08:
            trend = "falling"
    return {
        "predicted": round(pred, 1),
        "low": round(max(0, pred - margin), 1),
        "high": round(min(100, pred + margin), 1),
        "trend": trend,
        "source": artifact.get("model_type", "ensemble"),
    }
