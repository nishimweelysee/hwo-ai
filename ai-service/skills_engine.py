"""Skills & competency AI: training prioritization, gap analysis, development recommendations."""
from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier

CERT_STATUSES = {"active", "expiring", "expired", "revoked"}
PRIORITY_WEIGHTS = {"urgent": 1.0, "high": 0.75, "medium": 0.5, "low": 0.25}


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


def _priority_label(score: float) -> str:
    if score >= 0.8:
        return "urgent"
    if score >= 0.6:
        return "high"
    if score >= 0.4:
        return "medium"
    return "low"


def prioritize_training(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not items:
        return []
    ranked = []
    for item in items:
        staff_count = _as_int(item.get("staff_count") or item.get("staffCount"), 1)
        days_to_expiry = item.get("days_to_expiry") or item.get("daysToExpiry")
        days = _as_int(days_to_expiry, 60) if days_to_expiry is not None else 60
        gap_type = str(item.get("gap_type") or item.get("gapType") or "renewal")
        coverage = _as_float(item.get("coverage_percent") or item.get("coveragePercent"), 100)
        department = str(item.get("department") or "")

        expiry_pressure = max(0.0, 1.0 - days / 90.0) if gap_type == "renewal" else 0.0
        gap_pressure = max(0.0, 1.0 - coverage / 100.0) if gap_type == "requirement" else 0.3
        volume = min(1.0, staff_count / 10.0)
        icu_boost = 0.1 if any(k in department.lower() for k in ("icu", "emergency", "critical")) else 0.0

        score = min(1.0, 0.4 * expiry_pressure + 0.35 * gap_pressure + 0.15 * volume + icu_boost)
        ranked.append({
            "id": item.get("id") or item.get("certification") or item.get("cert_name"),
            "certification": item.get("certification") or item.get("cert_name") or item.get("name"),
            "department": department,
            "staff_count": staff_count,
            "gap_type": gap_type,
            "priority": _priority_label(score),
            "priority_score": round(score, 2),
            "rationale": _training_rationale(gap_type, days, coverage, staff_count),
            "source": "skills-ranker",
        })
    ranked.sort(key=lambda r: r["priority_score"], reverse=True)
    for i, row in enumerate(ranked):
        row["rank"] = i + 1
    return ranked


def _training_rationale(gap_type: str, days: int, coverage: float, staff_count: int) -> str:
    if gap_type == "requirement":
        return f"AI: {staff_count} staff missing required cert — dept coverage {coverage:.0f}%"
    if days <= 14:
        return f"AI: {staff_count} renewal(s) due within {days} days — expedite training"
    if days <= 30:
        return f"AI: schedule renewal training for {staff_count} staff ({days}d remaining)"
    return f"AI: plan refresher for {staff_count} staff"


def analyze_department_gaps(departments: list[dict[str, Any]]) -> dict[str, Any]:
    if not departments:
        return {"gaps": [], "avg_coverage": 100.0, "at_risk_departments": 0, "source": "heuristic"}
    gaps = []
    coverages = []
    at_risk = 0
    for dept in departments:
        name = str(dept.get("name") or dept.get("department") or "")
        required = dept.get("required_certs") or dept.get("requiredCerts") or []
        staff_total = _as_int(dept.get("staff_total") or dept.get("staffTotal"), 0)
        qualified = _as_int(dept.get("qualified_staff") or dept.get("qualifiedStaff"), 0)
        coverage = (qualified * 100.0 / staff_total) if staff_total > 0 else 100.0
        coverages.append(coverage)
        missing_certs = dept.get("missing_breakdown") or dept.get("missingBreakdown") or []
        if coverage < 80:
            at_risk += 1
        for cert in required:
            missing = 0
            if isinstance(missing_certs, list):
                for m in missing_certs:
                    if isinstance(m, dict) and m.get("cert") == cert:
                        missing = _as_int(m.get("missing"), 0)
                        break
            if missing == 0 and staff_total > qualified:
                missing = max(0, staff_total - qualified)
            if missing > 0 or coverage < 100:
                gap_score = min(1.0, missing / max(1, staff_total) + (1 - coverage / 100) * 0.5)
                gaps.append({
                    "department": name,
                    "certification": cert,
                    "missing_count": missing,
                    "coverage_percent": round(coverage, 1),
                    "gap_score": round(gap_score, 2),
                })
    gaps.sort(key=lambda g: g["gap_score"], reverse=True)
    return {
        "gaps": gaps[:20],
        "avg_coverage": round(float(np.mean(coverages)) if coverages else 100.0, 1),
        "at_risk_departments": at_risk,
        "source": "skills-gap-analyzer",
    }


def recommend_development(staff_profile: dict[str, Any]) -> dict[str, Any]:
    role = str(staff_profile.get("role") or "").lower()
    dept = str(staff_profile.get("department") or "").lower()
    cert_count = _as_int(staff_profile.get("cert_count") or staff_profile.get("certCount"), 0)
    expiring = _as_int(staff_profile.get("expiring_count") or staff_profile.get("expiringCount"), 0)
    gaps = staff_profile.get("skill_gaps") or staff_profile.get("skillGaps") or []
    gap_count = len(gaps) if isinstance(gaps, list) else 0
    available = staff_profile.get("available_programs") or staff_profile.get("availablePrograms") or []
    if not isinstance(available, list):
        available = []
    program_names = [str(p) for p in available if p]

    def pick_program(keywords: tuple[str, ...], fallback: str) -> str:
        for name in program_names:
            lower = name.lower()
            if any(k in lower for k in keywords):
                return name
        return program_names[0] if program_names else fallback

    recommendations = []
    if expiring > 0:
        renewal = pick_program(("renewal", "certification", "workshop"), "Certification Renewal Workshop")
        recommendations.append({
            "program": renewal,
            "reason": f"{expiring} credential(s) expiring soon",
            "priority": "high",
        })
    if gap_count > 0:
        bootcamp = pick_program(("bootcamp", "skills", "targeted", "competency"), "Targeted Skills Bootcamp")
        recommendations.append({
            "program": bootcamp,
            "reason": f"Close {gap_count} competency gap(s): {', '.join(str(g) for g in gaps[:3])}",
            "priority": "urgent" if gap_count >= 2 else "medium",
        })
    if "nurse" in role and cert_count < 3:
        residency = pick_program(("nurse", "residency", "clinical", "foundational"), "Nurse Residency Program")
        recommendations.append({
            "program": residency,
            "reason": "Build foundational clinical competencies",
            "priority": "medium",
        })
    if any(k in dept for k in ("admin", "management")) or "lead" in role:
        leadership = pick_program(("leadership", "management", "development"), "Leadership Development")
        recommendations.append({
            "program": leadership,
            "reason": "Advance management and team leadership skills",
            "priority": "medium",
        })
    if not recommendations:
        continuing = pick_program(("continuing", "education", "credits"), "Continuing Education Credits")
        recommendations.append({
            "program": continuing,
            "reason": "Maintain licensure and stay current with best practices",
            "priority": "low",
        })
    recommendations.sort(key=lambda r: PRIORITY_WEIGHTS.get(r["priority"], 0), reverse=True)
    return {
        "recommendations": recommendations[:5],
        "top_pick": recommendations[0]["program"] if recommendations else None,
        "source": "skills-development-ranker",
    }
