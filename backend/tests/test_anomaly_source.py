"""The anomaly reader selects its evaluation source explicitly (docs/38 Phase 1
item 5).

Production evaluation must never fall back to synthetic-only data (docs/38
acceptance boundary). These pin that `_load_trip_rows` filters strictly to
`bc.source = 'live'` unless DEMO_MODE is enabled, and that the decision comes
from that same env flag - the one main.py already uses to decide whether to
even mount `/api/demo` - rather than from anything a caller could supply.
"""

from __future__ import annotations

import asyncio

from app.api import anomaly


class _FakeConnection:
    def __init__(self) -> None:
        self.queries: list[str] = []

    async def fetch(self, query: str, *args):
        self.queries.append(query)
        return []


def test_demo_evaluation_disabled_by_default(monkeypatch):
    monkeypatch.delenv('DEMO_MODE', raising=False)
    assert anomaly._demo_evaluation_enabled() is False


def test_demo_evaluation_enabled_when_flag_set(monkeypatch):
    monkeypatch.setenv('DEMO_MODE', 'true')
    assert anomaly._demo_evaluation_enabled() is True


def test_production_reader_filters_to_live_only():
    conn = _FakeConnection()
    asyncio.run(anomaly._load_trip_rows(conn, include_synthetic=False))
    query = conn.queries[0]
    assert "WHERE bc.source = 'live'" in query
    assert "IN ('live', 'synthetic')" not in query


def test_demo_reader_includes_both_sources():
    conn = _FakeConnection()
    asyncio.run(anomaly._load_trip_rows(conn, include_synthetic=True))
    assert "WHERE bc.source IN ('live', 'synthetic')" in conn.queries[0]


def test_trip_is_synthetic_marks_a_trip_synthetic_if_any_contact_is():
    rows = [
        {'vessel_id': 'V1', 'trip_id': 'T1', 'is_synthetic': False},
        {'vessel_id': 'V1', 'trip_id': 'T1', 'is_synthetic': True},
        {'vessel_id': 'V2', 'trip_id': 'T2', 'is_synthetic': False},
    ]
    flags = anomaly._trip_is_synthetic(rows)
    assert flags[('V1', 'T1')] is True
    assert flags[('V2', 'T2')] is False
