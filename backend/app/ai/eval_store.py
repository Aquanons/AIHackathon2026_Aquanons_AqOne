from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

RESULTS_PATH = Path(__file__).resolve().parent / 'models' / 'eval_results.json'

# Every model in this project is calibrated on synthetic observations. The
# value travels with the numbers so the dashboard cannot display them without
# also displaying how they were produced.
CALIBRATION = 'synthetic'


def write_section(section: str, metrics: dict[str, Any]) -> Path:
    """Merge one eval's metrics into the shared results file.

    Merging rather than overwriting matters because the three eval scripts run
    independently - a plain write would mean running one erases the other two.
    """
    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)

    existing: dict[str, Any] = {}
    if RESULTS_PATH.exists():
        try:
            existing = json.loads(RESULTS_PATH.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, OSError):
            existing = {}

    if not isinstance(existing, dict):
        existing = {}

    existing[section] = dict(metrics) | {
        'generated_at': datetime.now(UTC).isoformat(),
        'calibration': CALIBRATION,
    }

    RESULTS_PATH.write_text(json.dumps(existing, indent=2, sort_keys=True), encoding='utf-8')
    return RESULTS_PATH


def read_results() -> dict[str, Any] | None:
    if not RESULTS_PATH.exists():
        return None
    try:
        data = json.loads(RESULTS_PATH.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError):
        return None
    return data if isinstance(data, dict) else None
