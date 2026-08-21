from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass
class DemoState:
    scenario: str | None = None
    beat: int = -1
    fired: set[int] = field(default_factory=set)
    run_id: str | None = None
    updated_at: datetime | None = None

    def response(self) -> dict[str, object]:
        return {
            'scenario': self.scenario,
            'beat': self.beat,
            'fired': sorted(self.fired),
            'run_id': self.run_id,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


_state = DemoState()


def get_state() -> DemoState:
    return _state


async def reset(pool, run_id: str) -> dict[str, int | str]:
    deleted: dict[str, int | str] = {'run_id': run_id}
    tables = (
        'search_sectors',
        'incidents',
        'sos_events',
        'buoy_contacts',
        'barometric_readings',
        'squall_events',
        'advisories',
        'vessels',
    )
    async with pool.acquire() as conn:
        async with conn.transaction():
            for table in tables:
                result = await conn.execute(
                    f'DELETE FROM {table} WHERE demo_tag = $1',
                    run_id,
                )
                deleted[table] = int(result.rsplit(' ', 1)[-1])

    state = get_state()
    if state.run_id == run_id:
        state.scenario = None
        state.beat = -1
        state.fired.clear()
        state.run_id = None
        state.updated_at = datetime.now(UTC)
    return deleted
