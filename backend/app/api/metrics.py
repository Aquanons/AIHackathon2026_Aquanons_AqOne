from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.ai.eval_store import read_results

router = APIRouter(prefix='/api/ai/metrics', tags=['metrics'])


@router.get('')
async def metrics() -> dict[str, object]:
    """Evaluation figures produced by the three eval scripts.

    Returns 404 rather than placeholder values when the evals have not been
    run. The dashboard must show an empty state in that case - inventing
    numbers here would put unverified figures in front of an audience.
    """
    results = read_results()
    if not results:
        raise HTTPException(
            status_code=404,
            detail=(
                'No evaluation results yet. Run the eval scripts: '
                'python -m app.ai.drift_eval, app.ai.squall_eval, app.ai.trip_profile_eval'
            ),
        )
    return results
