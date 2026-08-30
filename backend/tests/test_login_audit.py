"""Login success/failure and admin-signup audit events (docs/41 Phase 2).

test_auth.py deliberately runs without a database to pin the pre-DB 401
boundary; this file adds a fake pool so the success/failure paths - which do
reach the database - can be exercised too.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app import db as app_db
from app.api import auth as auth_api
from app.auth import hash_password
from app.main import app


class _FakePool:
    def __init__(self) -> None:
        self.users: dict[str, dict[str, object]] = {}
        self.audit_events: list[dict[str, object]] = []
        self._next_id = 1

    def seed_user(self, *, email: str, password: str, role: str = 'mdrrmo') -> dict[str, object]:
        row = {
            'id': self._next_id,
            'email': email,
            'email_normalized': email.lower(),
            'password_hash': hash_password(password),
            'full_name': '',
            'role': role,
            'last_login_at': None,
        }
        self._next_id += 1
        self.users[row['email_normalized']] = row
        return row

    def acquire(self):
        return self

    def transaction(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def execute(self, query: str, *args):
        if 'INSERT INTO operations_audit_events' in query:
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
        if 'UPDATE users' in query and 'SET last_login_at' in query:
            user_id = args[0]
            for row in self.users.values():
                if row['id'] == user_id:
                    row['last_login_at'] = datetime.now(UTC)
            return 'UPDATE 1'
        return 'OK'

    async def fetchrow(self, query: str, *args):
        if 'SELECT * FROM users WHERE email_normalized' in query:
            return self.users.get(args[0])
        if 'INSERT INTO users' in query:
            email, email_normalized, password_hash, full_name, role = args
            row = {
                'id': self._next_id,
                'email': email,
                'email_normalized': email_normalized,
                'password_hash': password_hash,
                'full_name': full_name,
                'role': role,
                'last_login_at': None,
            }
            self._next_id += 1
            self.users[email_normalized] = row
            return row
        return None

    async def fetchval(self, query: str, *args):
        if 'SELECT 1 FROM users WHERE email_normalized' in query:
            return 1 if args[0] in self.users else None
        return None


def _patch(monkeypatch, pool: _FakePool) -> None:
    monkeypatch.setattr(app_db, 'get_pool', lambda: pool)
    monkeypatch.setattr(auth_api, 'get_pool', lambda: pool)


def test_successful_login_records_one_audit_event(monkeypatch):
    pool = _FakePool()
    pool.seed_user(email='ops@example.com', password='correct horse battery staple')
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/login', json={'email': 'ops@example.com', 'password': 'correct horse battery staple'},
        )

    assert response.status_code == 200
    assert len(pool.audit_events) == 1
    event = pool.audit_events[0]
    assert event['action'] == 'auth.login_success'
    assert event['outcome'] == 'success'
    assert event['actor_email'] == 'ops@example.com'


def test_wrong_password_records_one_failure_event_and_no_success_leak(monkeypatch):
    pool = _FakePool()
    pool.seed_user(email='ops@example.com', password='correct horse battery staple')
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/login', json={'email': 'ops@example.com', 'password': 'wrong password'},
        )

    assert response.status_code == 401
    assert len(pool.audit_events) == 1
    event = pool.audit_events[0]
    assert event['action'] == 'auth.login_failure'
    assert event['outcome'] == 'failure'
    assert event['actor_user_id'] is None
    # Never the password.
    assert 'wrong password' not in str(event)
    assert 'correct horse battery staple' not in str(event)


def test_unknown_email_records_the_same_failure_event_as_wrong_password(monkeypatch):
    """The existing endpoint deliberately returns the same message/timing for
    an unknown email and a wrong password so it never confirms which emails
    exist. The audit insert runs identically on both branches, so it must
    not reopen that gap by producing a distinguishable event shape.
    """
    pool = _FakePool()
    _patch(monkeypatch, pool)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/login', json={'email': 'nobody@example.com', 'password': 'anything12345'},
        )

    assert response.status_code == 401
    assert len(pool.audit_events) == 1
    assert pool.audit_events[0]['action'] == 'auth.login_failure'
    assert pool.audit_events[0]['outcome'] == 'failure'


def test_admin_signup_records_one_audit_event_without_setup_key_or_password(monkeypatch):
    pool = _FakePool()
    _patch(monkeypatch, pool)
    monkeypatch.setenv('ADMIN_SETUP_KEY', 'the-real-key')

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            '/api/admin-signup',
            json={
                'setup_key': 'the-real-key',
                'email': 'new-admin@example.com',
                'password': 'password12345',
                'role': 'admin',
            },
        )

    assert response.status_code == 201
    assert len(pool.audit_events) == 1
    event = pool.audit_events[0]
    assert event['action'] == 'auth.admin_signup'
    assert event['actor_user_id'] is None
    assert '"role": "admin"' in event['metadata']
    assert 'the-real-key' not in event['metadata']
    assert 'password12345' not in event['metadata']
