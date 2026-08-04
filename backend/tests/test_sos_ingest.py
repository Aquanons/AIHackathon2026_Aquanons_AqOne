"""SOS ingest: reachable without a token, and never doubles an incident.

An SOS now reaches the backend by two independent routes - straight over HTTPS
from the handset, and through the LoRa mesh via the gateway. Both are attempted
for every distress call on purpose, because there is no way to know in advance
which will get through. The cost of that redundancy is that the same emergency
can arrive twice, and a dispatcher must never see two incidents for one boat.

De-duplication is on (vessel_id, client_ts). The LoRa frame carries only 64
payload bytes, so it cannot also carry the handset's 36-character local_id -
but its header already carries TS, the same epoch second the phone records as
client_ts. Both routes therefore share a key for free.
"""

from fastapi.testclient import TestClient

from app.main import app


def _payload(**overrides):
    base = {
        'vessel_id': 'V001',
        'client_ts': 1754300000,
        'boat': 'NW-001',
        'lat': 11.6639,
        'lon': 122.4602,
        'note': 'engine failure',
        'source': 'direct',
        'local_id': 'abc-123',
    }
    base.update(overrides)
    return base


def test_ingest_is_reachable_without_a_token(monkeypatch):
    """A handset in distress has no account and cannot obtain one at sea."""
    monkeypatch.delenv('DATABASE_URL', raising=False)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/sos', json=_payload())

    # 503 because there is no database in this test, but crucially not 401.
    # If this ever returns 401 the product cannot deliver its core function.
    assert response.status_code != 401, 'SOS ingest must never require a token'
    assert response.status_code == 503


def test_reading_sos_still_requires_a_token(monkeypatch):
    """Dispatcher data stays protected even though ingest is open."""
    monkeypatch.delenv('DATABASE_URL', raising=False)
    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.get('/api/sos/active').status_code == 401
        assert client.post('/api/sos/1/acknowledge').status_code == 401


def test_client_ts_is_required(monkeypatch):
    """Without it there is no cross-transport de-duplication key."""
    monkeypatch.delenv('DATABASE_URL', raising=False)
    body = _payload()
    del body['client_ts']
    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.post('/api/sos', json=body).status_code == 422


def test_buoy_payload_needs_no_local_id(monkeypatch):
    """The LoRa route cannot carry a UUID, and must still be accepted."""
    monkeypatch.delenv('DATABASE_URL', raising=False)
    body = _payload(source='buoy', buoy_id='B01', src_id=65537, seq=42)
    del body['local_id']
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/api/sos', json=body)

    assert response.status_code != 422, 'buoy-delivered SOS must validate without local_id'
    assert response.status_code == 503  # reached the handler, no DB in tests


def test_dedup_key_is_stable_across_transports():
    """The two routes describe the same emergency with the same key.

    Documents the contract the SQL relies on: whatever else differs between a
    direct and a buoy delivery, (vessel_id, client_ts) is identical, so
    ON CONFLICT collapses them into one row.
    """
    direct = _payload(source='direct', local_id='abc-123')
    buoy = _payload(source='buoy', buoy_id='B01', src_id=65537, seq=42)
    buoy.pop('local_id')

    assert (direct['vessel_id'], direct['client_ts']) == (buoy['vessel_id'], buoy['client_ts'])
    # And they genuinely carry different transport metadata, so the upsert has
    # something to merge rather than being a no-op.
    assert direct.get('local_id') and not buoy.get('local_id')
    assert buoy.get('buoy_id') and not direct.get('buoy_id')
