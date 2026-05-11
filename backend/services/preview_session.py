"""Preview-session staleness tracking.

Module-level state — single FastAPI process. Phase 4 will swap this for an
abstracted PreviewSessionStore with a Redis impl when persistence is real.
For now, behavior matches the prior in-process dict in main.py.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Optional

from fastapi.responses import JSONResponse


PREVIEW_SESSION_TTL_SECONDS = 60.0


@dataclass
class PreviewSessionState:
    latest_seq: int = -1
    active_requests: int = 0
    last_touched: float = 0.0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_preview_sessions: dict[str, PreviewSessionState] = {}


def cleanup_preview_sessions(now: float) -> None:
    """Remove sessions that are idle and older than the TTL."""
    expired = [
        sid for sid, state in _preview_sessions.items()
        if state.active_requests == 0 and (now - state.last_touched) > PREVIEW_SESSION_TTL_SECONDS
    ]
    for sid in expired:
        _preview_sessions.pop(sid, None)


def get_preview_session_state(session_id: str) -> PreviewSessionState:
    now = time.monotonic()
    cleanup_preview_sessions(now)
    state = _preview_sessions.get(session_id)
    if state is None:
        state = PreviewSessionState(last_touched=now)
        _preview_sessions[session_id] = state
        return state
    state.last_touched = now
    return state


def touch_preview_session_state(state: PreviewSessionState) -> None:
    state.last_touched = time.monotonic()


def record_preview_request(session_id: str, request_seq: int) -> PreviewSessionState:
    state = get_preview_session_state(session_id)
    state.active_requests += 1
    state.latest_seq = max(state.latest_seq, request_seq)
    touch_preview_session_state(state)
    return state


def _stale_preview_response(session_id: str, request_seq: int, latest_seq: int) -> JSONResponse:
    """Internal helper: build the 409 stale-preview JSONResponse."""
    return JSONResponse(
        status_code=409,
        content={
            "error": "stale_preview",
            "message": f"Preview request {request_seq} for session '{session_id}' is stale",
            "details": [f"Latest preview request sequence is {latest_seq}"],
        },
    )


def stale_response_if_needed(
    session_state: Optional[PreviewSessionState],
    session_id: Optional[str],
    request_seq: Optional[int],
) -> Optional[JSONResponse]:
    """Return a 409 JSONResponse if `request_seq` is older than the latest
    seen sequence for the session; otherwise return None."""
    if session_state is None or session_id is None or request_seq is None:
        return None
    touch_preview_session_state(session_state)
    if request_seq < session_state.latest_seq:
        return _stale_preview_response(session_id, request_seq, session_state.latest_seq)
    return None
