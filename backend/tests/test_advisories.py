"""Official advisories must stay current and honest on the public feed.

Two things this pins, both already broken once (docs/37):

  * An expired or not-yet-published advisory must never reach
    `GET /api/public/advisories` - the handset used to rely on client-side
    filtering alone, which only helps a phone that actually redownloads a
    fresh copy.
  * The public response must serialise the documented `image_url` field, not
    the internal `cover_image` storage column the app does not parse.

Unauthenticated publishing must still be rejected - the create/update/delete
operator boundary is unrelated to this fix and must not regress alongside it.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from fastapi.testclient import TestClient

from app.api import advisories as advisories_api
from app.auth import create_token
from app.main import app

ADVISORIES = '/api/advisories'
PUBLIC_ADVISORIES = '/api/public/advisories'


class _FakeAdvisoryPool:
    def __init__(self) -> None:
        self.rows: list[dict[str, object]] = []
        self.audit_events: list[dict[str, object]] = []
        self._next_id = 1

    def acquire(self):
        return self

    def transaction(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def execute(self, query: str, *args):
        assert 'INSERT INTO operations_audit_events' in query
        (
            actor_user_id, actor_email, actor_role, action, resource_type,
            resource_id, outcome, correlation_key, is_demo, metadata,
        ) = args
        self.audit_events.append({
            'actor_user_id': actor_user_id,
            'actor_email': actor_email,
            'actor_role': actor_role,
            'action': action,
            'resource_type': resource_type,
            'resource_id': resource_id,
            'outcome': outcome,
            'correlation_key': correlation_key,
            'is_demo': is_demo,
            'metadata': metadata,
        })
        return 'INSERT 0 1'

    def seed(self, **overrides: object) -> dict[str, object]:
        now = datetime.now(UTC)
        row: dict[str, object] = {
            'id': self._next_id,
            'title': 'Notice',
            'category': 'Weather Advisory',
            'description': 'Details.',
            'municipality': 'All',
            'priority': 'Information',
            'publish_date': now.date(),
            'expiration_date': None,
            'cover_image': None,
            'status': 'Published',
            'source': 'LGU',
            'score': None,
            'created_by': 'ops@example.com',
            'demo_tag': None,
            'created_at': now,
            'updated_at': now,
        }
        row.update(overrides)
        self._next_id += 1
        self.rows.append(row)
        return row

    async def fetchrow(self, query: str, *args):
        assert 'INSERT INTO advisories' in query
        (
            title,
            category,
            description,
            municipality,
            priority,
            publish_date,
            expiration_date,
            cover_image,
            status,
            created_by,
        ) = args
        return self.seed(
            title=title,
            category=category,
            description=description,
            municipality=municipality,
            priority=priority,
            publish_date=publish_date,
            expiration_date=expiration_date,
            cover_image=cover_image,
            status=status,
            created_by=created_by,
        )

    async def fetch(self, query: str, *args):
        assert 'FROM advisories' in query
        status, municipality, only_active, today = args
        rows = self.rows
        if status is not None:
            rows = [r for r in rows if r['status'] == status]
        if municipality not in (None, 'All'):
            rows = [
                r
                for r in rows
                if r['municipality'] in ('All', municipality)
            ]
        if only_active:
            rows = [r for r in rows if r['publish_date'] <= today]
            rows = [
                r
                for r in rows
                if r['expiration_date'] is None or r['expiration_date'] >= today
            ]
        return sorted(rows, key=lambda r: (r['publish_date'], r['id']), reverse=True)


def _patch_pool(monkeypatch, pool: _FakeAdvisoryPool) -> None:
    monkeypatch.setattr(advisories_api, 'get_pool', lambda: pool)


def test_unauthenticated_publish_is_rejected(monkeypatch):
    pool = _FakeAdvisoryPool()
    _patch_pool(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            ADVISORIES,
            json={'title': 'Fake notice', 'description': 'x'},
        )

    assert response.status_code == 401
    assert pool.rows == []


def test_public_feed_excludes_expired_future_and_draft_advisories(monkeypatch):
    pool = _FakeAdvisoryPool()
    _patch_pool(monkeypatch, pool)
    today = datetime.now(UTC).date()

    pool.seed(title='Active now', publish_date=today - timedelta(days=1))
    pool.seed(
        title='Expired yesterday',
        publish_date=today - timedelta(days=10),
        expiration_date=today - timedelta(days=1),
    )
    pool.seed(title='Not published yet', publish_date=today + timedelta(days=5))
    pool.seed(title='Still a draft', status='Draft')

    with TestClient(app) as client:
        response = client.get(PUBLIC_ADVISORIES)

    assert response.status_code == 200
    titles = {row['title'] for row in response.json()['advisories']}
    assert titles == {'Active now'}


def test_public_feed_serialises_image_url_not_cover_image(monkeypatch):
    pool = _FakeAdvisoryPool()
    _patch_pool(monkeypatch, pool)
    pool.seed(title='Damaged pier', cover_image='https://example.org/pier.jpg')

    with TestClient(app) as client:
        response = client.get(PUBLIC_ADVISORIES)

    row = response.json()['advisories'][0]
    assert row['image_url'] == 'https://example.org/pier.jpg'
    assert 'cover_image' not in row


def test_authenticated_list_still_sees_draft_and_expired_for_operators(
    monkeypatch,
):
    """Filtering is a public-route concern; an operator managing advisories
    still needs to see and edit everything, including drafts and expired
    notices."""
    pool = _FakeAdvisoryPool()
    _patch_pool(monkeypatch, pool)
    today = datetime.now(UTC).date()
    pool.seed(title='Draft', status='Draft')
    pool.seed(
        title='Expired',
        expiration_date=today - timedelta(days=1),
        publish_date=today - timedelta(days=10),
    )
    token = create_token(1, 'ops@example.com', 'mdrrmo')

    with TestClient(app) as client:
        response = client.get(
            ADVISORIES, headers={'Authorization': f'Bearer {token}'}
        )

    titles = {row['title'] for row in response.json()['advisories']}
    assert titles == {'Draft', 'Expired'}


def test_create_advisory_persists_via_operator_token(monkeypatch):
    pool = _FakeAdvisoryPool()
    _patch_pool(monkeypatch, pool)
    token = create_token(1, 'ops@example.com', 'mdrrmo')

    with TestClient(app) as client:
        response = client.post(
            ADVISORIES,
            headers={'Authorization': f'Bearer {token}'},
            json={
                'title': 'Habagat surge expected',
                'description': 'Small craft warning in effect.',
                'priority': 'Warning',
                'cover_image': 'https://example.org/surge.jpg',
            },
        )

    assert response.status_code == 201
    advisory = response.json()['advisory']
    assert advisory['title'] == 'Habagat surge expected'
    assert advisory['image_url'] == 'https://example.org/surge.jpg'

    # docs/41 Phase 2: one committed domain row, one matching redacted audit
    # event in the same call - and never the free-text title/description.
    assert len(pool.audit_events) == 1
    event = pool.audit_events[0]
    assert event['action'] == 'advisory.create'
    assert event['resource_type'] == 'advisory'
    assert event['resource_id'] == str(advisory['id'])
    assert event['outcome'] == 'created'
    assert 'Habagat surge expected' not in event['metadata']
    assert 'Small craft warning' not in event['metadata']


def test_expiration_before_publish_date_is_rejected(monkeypatch):
    pool = _FakeAdvisoryPool()
    _patch_pool(monkeypatch, pool)
    token = create_token(1, 'ops@example.com', 'mdrrmo')

    with TestClient(app) as client:
        response = client.post(
            ADVISORIES,
            headers={'Authorization': f'Bearer {token}'},
            json={
                'title': 'Bad dates',
                'description': 'x',
                'publish_date': str(date(2026, 8, 20)),
                'expiration_date': str(date(2026, 8, 1)),
            },
        )

    assert response.status_code == 422
