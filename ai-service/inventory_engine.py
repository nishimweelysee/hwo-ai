"""Inventory AI: demand forecasting, reorder optimization, procurement ranking."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge

DEMAND_TYPES = {"issue", "transfer_out"}


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def aggregate_weekly_demand(movements: list[dict[str, Any]], weeks: int = 12) -> list[dict[str, Any]]:
    """Bucket issue-like movements into ISO weeks."""
    if not movements:
        return []
    dated: list[tuple[datetime, float]] = []
    for m in movements:
        mtype = str(m.get("type", "")).lower()
        if mtype not in DEMAND_TYPES and mtype != "issue":
            continue
        created = m.get("created_at") or m.get("createdAt")
        if not created:
            continue
        try:
            dt = datetime.fromisoformat(str(created)[:19])
        except ValueError:
            continue
        qty = _as_float(m.get("quantity"), 0)
        if qty > 0:
            dated.append((dt, qty))
    if not dated:
        return []
    dated.sort(key=lambda x: x[0])
    end = dated[-1][0]
    start = end - timedelta(days=7 * weeks)
    buckets: dict[str, float] = {}
    for dt, qty in dated:
        if dt < start:
            continue
        key = dt.strftime("%Y-W%W")
        buckets[key] = buckets.get(key, 0.0) + qty
    if not buckets:
        return [{"week": end.strftime("%Y-W%W"), "demand": 0.0}]
    return [{"week": k, "demand": round(v, 2)} for k, v in sorted(buckets.items())]


def _demand_features(series: np.ndarray) -> np.ndarray:
    n = len(series)
    rows = []
    for i in range(n):
        lag1 = series[i - 1] if i > 0 else series[i]
        lag2 = series[i - 2] if i >= 2 else lag1
        lag4 = series[i - 4] if i >= 4 else lag1
        window = series[max(0, i - 4):i] if i > 0 else series[:1]
        roll_mean = float(np.mean(window)) if len(window) else float(series[i])
        roll_std = float(np.std(window)) if len(window) > 1 else 0.0
        ewma = float(series[0])
        alpha = 0.35
        for j in range(1, i + 1):
            ewma = alpha * float(series[j]) + (1 - alpha) * ewma
        rows.append([float(i), lag1, lag2, lag4, roll_mean, roll_std, ewma, float(i % 4)])
    return np.array(rows, dtype=float)


def predict_demand(payload: dict[str, Any]) -> dict[str, Any]:
    movements = payload.get("movements") or []
    horizon_weeks = max(1, min(8, _as_int(payload.get("horizon_weeks"), 4)))
    lead_time_days = max(1, _as_int(payload.get("lead_time_days"), 7))

    weekly = aggregate_weekly_demand(movements)
    demands = np.array([w["demand"] for w in weekly], dtype=float)
    n = len(demands)

    if n < 3:
        avg = float(np.mean(demands)) if n else _as_float(payload.get("in_use"), 1)
        weekly_forecast = round(max(0.5, avg), 2)
        daily_rate = weekly_forecast / 7.0
        return {
            "weekly_demand": weekly_forecast,
            "daily_demand": round(daily_rate, 2),
            "horizon_weeks": horizon_weeks,
            "confidence": 0.45,
            "trend": "stable",
            "days_until_stockout": None,
            "source": "heuristic-demand",
            "history_weeks": n,
        }

    X = _demand_features(demands)
    y = demands
    split = max(2, int(n * 0.75))
    ridge = Ridge(alpha=0.5).fit(X[:split], y[:split])
    gbm = HistGradientBoostingRegressor(
        max_depth=4, learning_rate=0.1, max_iter=120, random_state=42
    )
    gbm.fit(X[:split], y[:split])

    val_pred = 0.4 * ridge.predict(X[split:]) + 0.6 * gbm.predict(X[split:]) if split < n else np.array([])
    mae = float(np.mean(np.abs(y[split:] - val_pred))) if len(val_pred) else 0.0
    confidence = max(0.5, min(0.95, 1.0 - mae / (float(np.mean(y)) + 1.0)))

    ridge_full = Ridge(alpha=0.5).fit(X, y)
    gbm_full = HistGradientBoostingRegressor(
        max_depth=4, learning_rate=0.1, max_iter=120, random_state=42
    )
    gbm_full.fit(X, y)

    next_idx = n
    x_next = np.array([[
        float(next_idx),
        float(demands[-1]),
        float(demands[-2]) if n >= 2 else float(demands[-1]),
        float(demands[-4]) if n >= 4 else float(demands[-1]),
        float(np.mean(demands[-4:])),
        float(np.std(demands[-4:])) if n > 1 else 0.0,
        float(np.mean(demands[-3:])),
        float(next_idx % 4),
    ]])
    pred = 0.4 * float(ridge_full.predict(x_next)[0]) + 0.6 * float(gbm_full.predict(x_next)[0])
    pred = max(0.0, pred)

    recent = demands[-3:] if n >= 3 else demands
    prior = demands[-6:-3] if n >= 6 else demands[: max(1, n // 2)]
    trend = "stable"
    if len(prior) and np.mean(prior) > 0:
        change = (float(np.mean(recent)) - float(np.mean(prior))) / float(np.mean(prior))
        if change > 0.12:
            trend = "rising"
        elif change < -0.12:
            trend = "falling"

    free_stock = _as_float(payload.get("free_stock"), 0)
    daily_rate = pred / 7.0
    days_until = int(free_stock / daily_rate) if daily_rate > 0.01 else None
    if days_until is not None and days_until <= lead_time_days:
        pred *= 1.15

    return {
        "weekly_demand": round(pred, 2),
        "daily_demand": round(pred / 7.0, 2),
        "horizon_weeks": horizon_weeks,
        "confidence": round(confidence, 2),
        "trend": trend,
        "days_until_stockout": days_until,
        "source": "ensemble-demand",
        "history_weeks": n,
    }


def _reorder_features(item: dict[str, Any]) -> np.ndarray:
    free = _as_float(item.get("free_stock"))
    reorder = max(1.0, _as_float(item.get("reorder_level"), 5))
    available = max(1.0, _as_float(item.get("available"), 1))
    in_use = _as_float(item.get("in_use"))
    utilization = in_use / available
    weekly_demand = _as_float(item.get("weekly_demand"), reorder * 0.5)
    lead_time = max(1.0, _as_float(item.get("lead_time_days"), 7))
    unit_cost = _as_float(item.get("unit_cost"), 1000)
    critical = 1.0 if item.get("critical") else 0.0
    days_stockout = _as_float(item.get("days_until_stockout"), free / max(0.1, weekly_demand / 7))
    return np.array([[
        free / reorder,
        utilization,
        weekly_demand / reorder,
        lead_time / 14.0,
        np.log1p(unit_cost) / 10.0,
        critical,
        days_stockout / 30.0,
        in_use / max(1.0, free + in_use),
    ]])


def optimize_reorders(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not items:
        return []

    # Train a lightweight ranker on synthetic + observed labels
    X_rows = []
    y_qty = []
    for item in items:
        free = _as_float(item.get("free_stock"))
        reorder = max(1, _as_int(item.get("reorder_level"), 5))
        weekly = _as_float(item.get("weekly_demand"), reorder * 0.4)
        lead = max(1, _as_int(item.get("lead_time_days"), 7))
        cover_weeks = lead / 7.0 + 1.0
        baseline = max(reorder, int(weekly * cover_weeks + reorder - free))
        if item.get("critical"):
            baseline = max(baseline, reorder + _as_int(item.get("in_use"), 0))
        X_rows.append(_reorder_features({**item, "weekly_demand": weekly})[0])
        y_qty.append(float(baseline))

    X = np.array(X_rows, dtype=float)
    y = np.array(y_qty, dtype=float)
    model = HistGradientBoostingRegressor(
        max_depth=5, learning_rate=0.08, max_iter=150, random_state=7
    )
    if len(X) >= 3:
        model.fit(X, y)
        preds = model.predict(X)
    else:
        preds = y

    results = []
    for item, pred_qty in zip(items, preds):
        free = _as_float(item.get("free_stock"))
        reorder = max(1, _as_int(item.get("reorder_level"), 5))
        weekly = _as_float(item.get("weekly_demand"))
        lead = max(1, _as_int(item.get("lead_time_days"), 7))
        suggested = max(reorder, int(round(pred_qty)))
        days_cover = int((free + suggested) / max(0.1, weekly / 7)) if weekly > 0 else None
        priority_score = _priority_score(item, weekly, lead)
        priority = "urgent" if priority_score >= 0.75 else "high" if priority_score >= 0.5 else "medium"
        unit_cost = _as_int(item.get("unit_cost"), 1000)
        results.append({
            "resource_id": item.get("resource_id") or item.get("resourceId"),
            "suggested_quantity": suggested,
            "priority": priority,
            "priority_score": round(priority_score, 2),
            "weekly_demand": round(weekly, 2),
            "days_of_cover": days_cover,
            "estimated_cost": suggested * unit_cost,
            "rationale": _rationale(item, weekly, lead, suggested),
            "source": "gbm-reorder",
        })
    results.sort(key=lambda r: r["priority_score"], reverse=True)
    return results


def _priority_score(item: dict[str, Any], weekly: float, lead: int) -> float:
    free = _as_float(item.get("free_stock"))
    reorder = max(1.0, _as_float(item.get("reorder_level"), 5))
    available = max(1.0, _as_float(item.get("available"), 1))
    util = _as_float(item.get("in_use")) / available
    stock_ratio = free / reorder
    daily = weekly / 7.0
    days_left = free / daily if daily > 0.05 else 30.0
    lead_pressure = max(0.0, 1.0 - days_left / max(1.0, lead))
    util_pressure = min(1.0, util)
    stock_pressure = max(0.0, 1.0 - min(1.0, stock_ratio))
    critical_boost = 0.2 if item.get("critical") else 0.0
    return min(1.0, 0.35 * lead_pressure + 0.3 * util_pressure + 0.25 * stock_pressure + critical_boost)


def _rationale(item: dict[str, Any], weekly: float, lead: int, suggested: int) -> str:
    if item.get("critical"):
        return f"AI: critical utilization — order {suggested} units to cover {lead}d lead time"
    if weekly > 0 and _as_float(item.get("free_stock")) / max(0.1, weekly / 7) <= lead:
        return f"AI: projected stockout within lead time ({lead}d) — suggested {suggested} units"
    return f"AI: demand trend supports replenishment to {suggested} units"


def rank_procurement(requests: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = []
    for req in requests:
        priority = str(req.get("priority", "medium")).lower()
        base = {"urgent": 1.0, "high": 0.75, "medium": 0.5, "low": 0.25}.get(priority, 0.5)
        status = str(req.get("status", "pending")).lower()
        status_boost = 0.1 if status == "pending" else 0.0
        qty = _as_float(req.get("quantity"), 1)
        cost = _as_float(req.get("estimated_total") or req.get("estimatedTotal"), qty * 1000)
        cost_factor = min(0.15, np.log1p(cost) / 50.0)
        score = min(1.0, base + status_boost + cost_factor * 0.05)
        ranked.append({
            "id": req.get("id"),
            "score": round(score, 2),
            "rank_reason": f"{priority} priority procurement ({status})",
        })
    ranked.sort(key=lambda r: r["score"], reverse=True)
    for i, row in enumerate(ranked):
        row["rank"] = i + 1
    return ranked


def analyze_inventory_portfolio(items: list[dict[str, Any]], lead_time_days: int = 7) -> dict[str, Any]:
    """Batch analyze inventory for dashboard summary."""
    if not items:
        return {
            "at_risk_count": 0,
            "forecast_weekly_spend": 0,
            "avg_confidence": 0.0,
            "top_risks": [],
            "source": "heuristic",
        }
    at_risk = 0
    spend = 0
    confidences: list[float] = []
    risks: list[dict[str, Any]] = []
    for item in items:
        demand = predict_demand({
            "movements": item.get("movements") or [],
            "free_stock": item.get("free_stock"),
            "in_use": item.get("in_use"),
            "lead_time_days": lead_time_days,
        })
        opt = optimize_reorders([{
            **item,
            "weekly_demand": demand["weekly_demand"],
            "days_until_stockout": demand.get("days_until_stockout"),
            "lead_time_days": lead_time_days,
        }])
        if not opt:
            continue
        row = opt[0]
        confidences.append(demand["confidence"])
        spend += row["estimated_cost"]
        if row["priority_score"] >= 0.5:
            at_risk += 1
            risks.append({
                "resource_id": item.get("resource_id") or item.get("resourceId"),
                "name": item.get("name"),
                "priority_score": row["priority_score"],
                "weekly_demand": demand["weekly_demand"],
                "suggested_quantity": row["suggested_quantity"],
                "days_until_stockout": demand.get("days_until_stockout"),
            })
    risks.sort(key=lambda r: r["priority_score"], reverse=True)
    return {
        "at_risk_count": at_risk,
        "forecast_weekly_spend": int(spend),
        "avg_confidence": round(float(np.mean(confidences)) if confidences else 0.0, 2),
        "top_risks": risks[:8],
        "source": "inventory-ai",
    }
