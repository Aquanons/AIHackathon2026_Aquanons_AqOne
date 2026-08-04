from __future__ import annotations

import logging
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

ALGORITHM = 'HS256'
TOKEN_TTL_HOURS = int(os.environ.get('JWT_EXPIRY_HOURS', '12'))

VALID_ROLES = {'mdrrmo', 'lgu', 'admin'}

_bearer = HTTPBearer(auto_error=False)


def _load_secret() -> str:
    secret = os.environ.get('JWT_SECRET')
    if secret:
        return secret
    # An ephemeral secret keeps the service booting (and the Railway healthcheck
    # green) when JWT_SECRET is unset, but every redeploy invalidates all
    # existing tokens. That is a deployment misconfiguration, so say so loudly.
    logger.warning(
        'JWT_SECRET is not set. Using an ephemeral secret - all sessions will '
        'be invalidated on restart. Set JWT_SECRET in the environment.'
    )
    return secrets.token_urlsafe(48)


JWT_SECRET = _load_secret()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except ValueError:
        return False


def normalize_email(email: str) -> str:
    return email.strip().lower()


def create_token(user_id: int, email: str, role: str) -> str:
    now = datetime.now(UTC)
    payload = {
        'sub': str(user_id),
        'email': email,
        'role': role,
        'iat': now,
        'exp': now + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail='session expired') from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail='invalid token') from exc


async def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    """Reject any request without a valid bearer token.

    Applied to every /api router except the auth endpoints themselves. The
    401 is what the dashboard listens for to bounce the operator back to the
    login page.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail='authentication required')
    claims = decode_token(credentials.credentials)
    return {
        'id': claims.get('sub'),
        'email': claims.get('email'),
        'role': claims.get('role'),
    }
