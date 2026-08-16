from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.db import get_pool

router = APIRouter(prefix='/api/mesh', tags=['mesh'])


class MeshChatIn(BaseModel):
    """A chat message relayed from the Heltec WiFi hub.

    Unauthenticated — fishermen have no account. The sender name is
    self-declared.
    """

    sender: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=256)


@router.post('/chat', status_code=201)
async def ingest_chat(payload: MeshChatIn) -> dict:
    """Accept a chat message and store it. Unauthenticated."""
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            '''
            INSERT INTO mesh_chat (sender, text)
            VALUES ($1, $2)
            RETURNING id, sender, text, created_at
            ''',
            payload.sender,
            payload.text,
        )
    return {
        'id': row['id'],
        'sender': row['sender'],
        'text': row['text'],
        'created_at': row['created_at'].isoformat(),
    }


@router.get('/chat')
async def get_chat(limit: int = 50) -> dict:
    """Return recent chat messages, oldest first. Unauthenticated."""
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            '''
            SELECT id, sender, text, created_at
            FROM mesh_chat
            ORDER BY created_at DESC
            LIMIT $1
            ''',
            min(limit, 200),
        )
    return {
        'messages': [
            {
                'id': row['id'],
                'sender': row['sender'],
                'text': row['text'],
                'created_at': row['created_at'].isoformat(),
            }
            for row in reversed(rows)
        ]
    }
