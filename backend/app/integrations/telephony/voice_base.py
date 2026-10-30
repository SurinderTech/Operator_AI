"""
Voice telephony base classes.

Provides:
  VoiceClientBase  — abstract interface all providers implement
  MockVoiceClient  — in-process mock for development / unit tests
"""
from __future__ import annotations

from app.core.logging import logger


# ---------------------------------------------------------------------------
# Base interface — so the rest of the codebase is provider-agnostic
# ---------------------------------------------------------------------------

class VoiceClientBase:
    """Provider-agnostic voice/telephony interface."""

    async def initiate_call(
        self,
        from_number: str,
        to_number: str,
        caller_id: str | None = None,
        stream_url: str | None = None,
        status_callback_url: str | None = None,
        extra: dict | None = None,
    ) -> dict:
        raise NotImplementedError

    async def get_call_details(self, call_sid: str) -> dict:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Mock provider — development / unit tests (never places real calls)
# ---------------------------------------------------------------------------

class MockVoiceClient(VoiceClientBase):
    """Mock voice client that never places real calls."""

    async def initiate_call(
        self,
        from_number: str,
        to_number: str,
        caller_id: str | None = None,
        stream_url: str | None = None,
        status_callback_url: str | None = None,
        extra: dict | None = None,
    ) -> dict:
        logger.info(
            f"[MOCK Voice] Would call {to_number} from {from_number} "
            f"(stream={stream_url})"
        )
        return {
            "data": {
                "id": "mock-call-00000000",
                "status": "queued",
                "direction": "outbound",
                "toE164": to_number,
            }
        }

    async def get_call_details(self, call_sid: str) -> dict:
        return {"data": {"id": call_sid, "status": "ended"}}
