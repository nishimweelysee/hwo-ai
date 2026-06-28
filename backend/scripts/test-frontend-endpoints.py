#!/usr/bin/env python3
"""Measure all GET endpoints called from the Next.js frontend."""
import json, subprocess, sys
from datetime import date

BASE = "http://localhost:8080"
TODAY = date.today().isoformat()
SLOW_THRESHOLD = 1.0
WARN_THRESHOLD = 0.5

def run_curl(args, timeout=90):
    cmd = ["curl", "-s", "-m", str(timeout), "-w", "\n__HTTP__%{http_code}__TIME__%{time_total}"] + args
    out = subprocess.run(cmd, capture_output=True, text=True)
    text = out.stdout
    http, timing = 0, 0.0
    if "__HTTP__" in text:
        body_text, meta = text.rsplit("__HTTP__", 1)
        parts = meta.split("__TIME__")
        http = int(parts[0]) if parts[0].isdigit() else 0
        try:
            timing = float(parts[1].strip())
        except ValueError:
            pass
        text = body_text
    return http, timing, text

login_http, login_time, login_body = run_curl([
    "-X", "POST", BASE + "/api/auth/login",
    "-H", "Content-Type: application/json",
    "-d", '{"email":"admin@hospital.org","password":"admin123"}',
], timeout=30)
if login_http != 200:
    print(f"LOGIN FAILED HTTP {login_http} in {login_time:.3f}s")
    sys.exit(1)
token = json.loads(login_body).get("token", "")
auth_hdr = f"Authorization: Bearer {token}"

def get(path):
    http, timing, body = run_curl(["-H", auth_hdr, BASE + path])
    return http, timing, len(body)

# page, path, needs_auth
ENDPOINTS = [
    ("auth", "/api/auth/session", False),
    ("auth", "/api/auth/registration-config", False),
    ("dashboard", "/api/dashboard/overview", True),
    ("dashboard", "/api/profile", True),
    ("ai-prediction", "/api/predictions", True),
    ("ai-prediction", "/api/predictions/models", True),
    ("ai-prediction", "/api/predictions/health", True),
    ("ai-prediction", "/api/predictions/training-status", True),
    ("ai-prediction", "/api/workload/summary", True),
    ("workload", "/api/workload?type=byHour", True),
    ("workload", "/api/workload?type=trend", True),
    ("workload", "/api/workload/overtime", True),
    ("workload", "/api/workload/ratios", True),
    ("workload", "/api/workload/skill-mix", True),
    ("workload", "/api/workload/anomalies", True),
    ("workload", "/api/settings/workload", True),
    ("workload", "/api/departments", True),
    ("workload", f"/api/staff?wellness=true", True),
    ("wellness", "/api/wellness/meta", True),
    ("wellness", "/api/wellness", True),
    ("wellness", "/api/wellness/ai/health", True),
    ("wellness", "/api/wellness/ai/model-info", True),
    ("wellness", "/api/wellness/trend", True),
    ("wellness", "/api/wellness/interventions", True),
    ("wellness", "/api/wellness/records", True),
    ("wellness", "/api/wellness/feedback", True),
    ("wellness", "/api/wellness/survey", True),
    ("wellness", "/api/staff", True),
    ("config", "/api/permissions/config", True),
    ("config", "/api/departments", True),
    ("config", "/api/settings", True),
    ("config", "/api/roles", True),
    ("config", "/api/roles?activeOnly=true", True),
    ("config", "/api/integrations/health", True),
    ("scheduling", "/api/scheduling/meta", True),
    ("scheduling", f"/api/scheduling/overview?date={TODAY}", True),
    ("scheduling", "/api/staff/options", True),
    ("users", "/api/users/overview", True),
    ("users", "/api/users?page=1&pageSize=20", True),
    ("compliance", "/api/compliance/overview", True),
    ("reporting", "/api/reports", True),
    ("reporting", "/api/reports/benchmark", True),
    ("reporting", "/api/scheduled-reports", True),
    ("audit", "/api/audit?type=all", True),
    ("audit", "/api/audit/anomalies", True),
    ("data-mgmt", "/api/data-settings", True),
    ("data-mgmt", "/api/data-settings/lineage", True),
    ("data-mgmt", "/api/data-settings/archives", True),
    ("import", "/api/import/meta", True),
    ("import", "/api/import/history", True),
    ("skills", "/api/certifications", True),
    ("skills", "/api/certifications/meta", True),
    ("skills", "/api/certifications/list", True),
    ("resources", "/api/resources", True),
    ("resources", "/api/resources/meta", True),
    ("resources", "/api/resources/inventory", True),
    ("resources", "/api/resources/movements", True),
    ("mobile", "/api/mobile/schedules?days=3", True),
    ("mobile", "/api/mobile/alerts", True),
    ("profile", "/api/user-activity?limit=10", True),
]

results = []
for page, path, auth in ENDPOINTS:
    if auth:
        http, timing, size = get(path)
    else:
        http, timing, body = run_curl([BASE + path])
        size = len(body)
    results.append((page, path, http, timing, size))

results.sort(key=lambda x: -x[3])
print(f"Login: {login_time:.3f}s")
print(f"{'PAGE':<12} {'TIME':>7} {'HTTP':>4} {'BYTES':>7}  PATH")
print("-" * 92)
slow, warn, failed = [], [], []
for page, path, http, timing, size in results:
    tag = ""
    if http >= 400 or http == 0:
        tag = " *** FAIL"
        failed.append((page, path, http, timing))
    elif timing > SLOW_THRESHOLD:
        tag = " *** SLOW"
        slow.append((page, path, http, timing))
    elif timing > WARN_THRESHOLD:
        tag = " ** WARN"
        warn.append((page, path, http, timing))
    print(f"{page:<12} {timing:>6.3f}s {http:>4} {size:>7}  {path}{tag}")

print(f"\nSummary: {len(results)} endpoints | slow(>{SLOW_THRESHOLD}s): {len(slow)} | warn(>{WARN_THRESHOLD}s): {len(warn)} | failed: {len(failed)}")
