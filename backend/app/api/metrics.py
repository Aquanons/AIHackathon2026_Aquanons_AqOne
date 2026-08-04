from __future__ import annotations

from fastapi import APIRouter

from app.ai.eval_store import read_results

router = APIRouter(prefix='/api/ai/metrics', tags=['metrics'])


@router.get('')
async def metrics() -> dict[str, object]:
    """Evaluation figures produced by the three eval scripts.

    Returns an empty structure rather than throwing an HTTP 404 when evals
    have not been run yet. This allows the dashboard to load cleanly and handle
    the empty state gracefully without triggering uncaught HTTP errors.
    """
    results = read_results()
    if not results:
        return {
            'status': 'no_results',
            'data': None,
            'message': (
                'No evaluation results yet. Run the eval scripts: '
                'python -m app.ai.drift_eval, app.ai.squall_eval, app.ai.trip_profile_eval'
            ),
        }
    return {
        'status': 'ok',
        'data': results,
    }