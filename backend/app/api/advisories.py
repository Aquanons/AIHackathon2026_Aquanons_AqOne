from __future__ import annotations

import logging
from typing import Any, Dict, List
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import require_user

logger = logging.getLogger(__name__)

# Router definition
router = APIRouter(prefix="/api/advisories", tags=["Advisories"])

# In-memory storage for active alerts (avoids altering database schema)
_active_advisories: List[Dict[str, Any]] = []


class DangerAlertPayload(BaseModel):
    id: str
    name: str
    score: int
    level: str
    trigger: str
    reasons: List[str]
    source: str
    observedAt: str


# 1. Protected endpoint (matches your app's security model)
@router.get("", response_model=List[Dict[str, Any]])
async def get_advisories(_: Any = Depends(require_user)) -> List[Dict[str, Any]]:
    """Called by Flutter app (widget.feeds.advisories())"""
    return _active_advisories


# 2. Public trigger endpoint (allows JS script to report danger without auth conflicts)
@router.post("/alert")
async def trigger_danger_alert(payload: DangerAlertPayload) -> Dict[str, Any]:
    """Called by dangerZonePredictor.js when danger or watch is detected"""
    advisory_item = {
        "id": payload.id,
        "title": f"⚠️ Alert: {payload.name}",
        "severity": payload.level.upper(),
        "score": payload.score,
        "message": f"{payload.trigger}. Reasons: {', '.join(payload.reasons)}",
        "createdAt": payload.observedAt,
    }

    global _active_advisories
    _active_advisories = [a for a in _active_advisories if a.get("id") != payload.id]

    if payload.level in ["danger", "watch"]:
        _active_advisories.insert(0, advisory_item)

    logger.warning(
        f"[DANGER ALERT] {payload.name} scored {payload.score}/100 ({payload.level})"
    )

    return {"status": "success", "advisory": advisory_item}