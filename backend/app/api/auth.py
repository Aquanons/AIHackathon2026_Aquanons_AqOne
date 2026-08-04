from __future__ import annotations

import hmac
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.auth import (
    VALID_ROLES,
    create_token,
    hash_password,
    normalize_email,
    require_user,
    verify_password,
)
from app.db import get_pool

router = APIRouter(prefix='/api', tags=['auth'])


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AdminSignupIn(BaseModel):
    setup_key: str
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = ''
    role: str = 'mdrrmo'


def _public_user(row) -> dict[str, object]:
    return {
        'id': row['id'],
        'email': row['email'],
        'name': row['full_name'] or row['email'],
        'role': row['role'],
    }


@router.post('/login')
async def login(payload: LoginIn) -> dict[str, object]:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT * FROM users WHERE email_normalized = $1',
            normalize_email(payload.email),
        )

    # Same message and timing path whether the address is unknown or the
    # password is wrong, so the endpoint does not confirm which emails exist.
    if row is None or not verify_password(payload.password, row['password_hash']):
        raise HTTPException(status_code=401, detail='Invalid email or password.')

    async with pool.acquire() as conn:
        await conn.execute('UPDATE users SET last_login_at = NOW() WHERE id = $1', row['id'])

    return {
        'token': create_token(row['id'], row['email'], row['role']),
        'user': _public_user(row),
        'message': 'Login successful.',
    }


@router.post('/admin-signup', status_code=201)
async def admin_signup(payload: AdminSignupIn) -> dict[str, object]:
    """Create an operator account. Requires the server-side setup key.

    There is deliberately no public registration path. This endpoint is
    unreachable unless ADMIN_SETUP_KEY is configured, so a misconfigured
    deployment cannot accidentally allow open account creation.
    """
    expected = os.environ.get('ADMIN_SETUP_KEY')
    if not expected:
        raise HTTPException(
            status_code=503,
            detail='Admin signup is disabled. ADMIN_SETUP_KEY is not configured.',
        )

    # Constant-time comparison so the key cannot be recovered by timing.
    if not hmac.compare_digest(payload.setup_key, expected):
        raise HTTPException(status_code=403, detail='Invalid setup key.')

    if payload.role not in VALID_ROLES:
        raise HTTPException(
            status_code=422,
            detail=f'role must be one of: {sorted(VALID_ROLES)}',
        )

    normalized = normalize_email(payload.email)
    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchval(
            'SELECT 1 FROM users WHERE email_normalized = $1', normalized
        )
        if existing:
            raise HTTPException(status_code=409, detail='That email already has an account.')

        row = await conn.fetchrow(
            '''
            INSERT INTO users (email, email_normalized, password_hash, full_name, role)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            ''',
            payload.email.strip(),
            normalized,
            hash_password(payload.password),
            payload.full_name.strip(),
            payload.role,
        )

    return {'user': _public_user(row), 'message': 'Account created.'}


@router.get('/me')
async def me(user: dict = Depends(require_user)) -> dict[str, object]:
    return {'user': user}
