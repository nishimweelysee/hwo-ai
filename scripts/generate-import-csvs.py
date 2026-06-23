#!/usr/bin/env python3
"""Generate bulk import CSV samples (default 20,000 rows each)."""

from __future__ import annotations

import argparse
from datetime import date, timedelta
from pathlib import Path

DEPT_CODES = [
    "EMERGENCY",
    "ICU",
    "SURGERY",
    "PEDIATRICS",
    "GENERALMEDICINE",
    "RADIOLOGY",
]
ROLE_CODES = ["RN", "PHYS", "NP", "LPN", "RT", "ADMIN"]
SHIFT_TYPES = ["Day", "Evening", "Night"]
FIRST_NAMES = [
    "Alex",
    "Jordan",
    "Taylor",
    "Morgan",
    "Casey",
    "Riley",
    "Jamie",
    "Quinn",
    "Avery",
    "Cameron",
]
LAST_NAMES = [
    "Chen",
    "Patel",
    "Garcia",
    "Kim",
    "Nguyen",
    "Brooks",
    "Rivera",
    "Sharma",
    "Wilson",
    "Okonkwo",
]


def write_staff(path: Path, rows: int) -> None:
    with path.open("w", encoding="utf-8") as f:
        f.write("# Staff Roster Bulk Sample\n")
        f.write("# Import this file first. Each row has a unique email for shift imports.\n")
        f.write("name,email,role_code,department_code\n")
        for i in range(rows):
            name = (
                f"{FIRST_NAMES[i % len(FIRST_NAMES)]} "
                f"{LAST_NAMES[(i // len(FIRST_NAMES)) % len(LAST_NAMES)]} {i + 1}"
            )
            f.write(
                f"{name},staff{i}@hospital.org,"
                f"{ROLE_CODES[i % len(ROLE_CODES)]},"
                f"{DEPT_CODES[i % len(DEPT_CODES)]}\n"
            )


def write_shift(path: Path, rows: int) -> None:
    today = date.today()
    staff_pool = min(rows, 20_000)
    with path.open("w", encoding="utf-8") as f:
        f.write("# Shift Schedule Bulk Sample\n")
        f.write("# Import after staff. References staff0@hospital.org through staff emails.\n")
        f.write("staff_email,date,shift,status,department_code\n")
        for i in range(rows):
            staff_idx = (i // 3) % staff_pool
            day_offset = i % 140
            shift = SHIFT_TYPES[i % len(SHIFT_TYPES)]
            d = today - timedelta(days=day_offset)
            f.write(
                f"staff{staff_idx}@hospital.org,{d.isoformat()},{shift},scheduled,"
                f"{DEPT_CODES[i % len(DEPT_CODES)]}\n"
            )


def write_patient(path: Path, rows: int) -> None:
    today = date.today()
    slots_per_day = len(DEPT_CODES) * 24
    with path.open("w", encoding="utf-8") as f:
        f.write("# Workload Volume Bulk Sample\n")
        f.write("# Hourly metrics per department — feeds workload charts and AI training.\n")
        f.write("date,hour,department_code,patient_volume,workload,staff_on_duty\n")
        for i in range(rows):
            day_offset = i // slots_per_day
            remainder = i % slots_per_day
            hour = remainder % 24
            dept_idx = remainder // 24
            d = today - timedelta(days=day_offset % 150)
            patient_vol = 28 + (i % 45)
            workload = min(99.0, 52 + (i % 40) + (8 if 8 <= hour <= 18 else 0))
            on_duty = 8 + (i % 14)
            f.write(
                f"{d.isoformat()},{hour},{DEPT_CODES[dept_idx % len(DEPT_CODES)]},"
                f"{patient_vol},{workload:.1f},{on_duty}\n"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate bulk import CSV samples")
    parser.add_argument("--rows", type=int, default=20_000, help="Rows per file (default: 20000)")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "sample-data" / "imports",
        help="Output directory",
    )
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    writers = {
        "staff": write_staff,
        "shift": write_shift,
        "patient": write_patient,
    }
    for name, writer in writers.items():
        out_path = args.out / f"{name}_20k.csv"
        writer(out_path, args.rows)
        print(f"Wrote {out_path} ({args.rows:,} data rows)")

    print("\nImport order: staff → shift → patient")


if __name__ == "__main__":
    main()
