"""
Tone (usetone.ai) Voice API client — primary telephony provider.

Official docs: https://docs.usetone.ai/
Authentication: Bearer token  (Authorization: Bearer tone_test_... or tone_live_...)
Base URL:       https://api.usetone.ai  (configurable via TONE_API_BASE_URL)

Environment is encoded in the key prefix:
  tone_test_...  -> sandbox (no carrier, no billing, no real phone rings)
  tone_live_...  -> production (real carrier, real billing)
"""
from __future__ import annotations

import hashlib
import hmac
import time
import uuid
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings
from app.core.logging import logger
from app.integrations.telephony.voice_base import VoiceClientBase


# ---------------------------------------------------------------------------
# Tone Voice Client
# ---------------------------------------------------------------------------

class ToneVoiceClient(VoiceClientBase):
    """
    Tone API telephony adapter.

    Required env vars:
        TONE_API_BASE_URL    -- e.g. https://api.usetone.ai  (no trailing slash)
        TONE_API_KEY         -- tone_test_... for sandbox, tone_live_... for production
        TONE_AGENT_ID        -- Tone agent ID to use for managed calls
        TONE_NUMBER_ID       -- Tone phone-number ID to dial from

    Optional:
        TONE_WEBHOOK_SECRET  -- whsec_... signing secret for verifying inbound events
    """

    BASE_URL_DEFAULT = "https://api.usetone.ai"

    def __init__(
        self,
        api_key: str,
        agent_id: str,
        number_id: str,
        base_url: str | None = None,
        webhook_secret: str | None = None,
    ) -> None:
        if not api_key:
            raise ValueError("TONE_API_KEY is required.")
        if not agent_id:
            raise ValueError("TONE_AGENT_ID is required.")
        if not number_id:
            raise ValueError("TONE_NUMBER_ID is required.")

        self._api_key = api_key
        self._agent_id = agent_id
        self._number_id = number_id
        self._base_url = (base_url or self.BASE_URL_DEFAULT).rstrip("/")
        self._webhook_secret = webhook_secret

        # Detect environment from key prefix
        self._is_test = api_key.startswith("tone_test_")
        env_label = "TEST" if self._is_test else "LIVE"
        logger.info(f"[Tone] Client initialised | env={env_label} base={self._base_url}")

        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    # -- helpers ---------------------------------------------------------------

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=4), reraise=True)
    async def _request(
        self,
        method: str,
        path: str,
        json: dict | None = None,
        idempotency_key: str | None = None,
    ) -> dict:
        url = f"{self._base_url}/v1/{path.lstrip('/')}"
        headers = dict(self._headers)
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.request(method, url, headers=headers, json=json)

        if resp.status_code >= 400:
            body = resp.text
            logger.error(f"[Tone] API error {resp.status_code} at {url}: {body}")
            raise RuntimeError(f"Tone API {resp.status_code}: {body}")

        return resp.json() if resp.text else {}

    # -- public API methods ----------------------------------------------------

    async def initiate_call(
        self,
        from_number: str,      # unused for Tone; dial-from is set by number_id
        to_number: str,
        caller_id: str | None = None,
        stream_url: str | None = None,
        status_callback_url: str | None = None,
        extra: dict | None = None,
    ) -> dict:
        """
        Place an outbound call via Tone.

        Tone docs: POST /v1/calls
          Required: agentId, numberId, toE164
          agentId is required for Tone-managed numbers;
          forbidden for BYO numbers (use stream_url path instead).

        Returns the full Tone call object wrapped in {"data": ...}.
        """
        idempotency_key = str(uuid.uuid4())

        payload: dict[str, Any] = {
            "agentId": self._agent_id,
            "numberId": self._number_id,
            "toE164": to_number,
        }
        if extra:
            payload.update(extra)

        logger.info(
            f"[Tone] Initiating outbound call | "
            f"to={to_number} numberId={self._number_id} agentId={self._agent_id} "
            f"idempotencyKey={idempotency_key}"
        )

        result = await self._request(
            "POST", "calls", json=payload, idempotency_key=idempotency_key
        )
        call_data = result.get("data", result)
        call_id = call_data.get("id", "")
        status = call_data.get("status", "")
        logger.info(f"[Tone] Call accepted | id={call_id} status={status}")
        return result

    async def get_call_details(self, call_sid: str) -> dict:
        """Fetch call detail record.  call_sid is the Tone call id."""
        return await self._request("GET", f"calls/{call_sid}")

    # -- number management helpers ---------------------------------------------

    async def list_numbers(self) -> list[dict]:
        """List phone numbers on this account."""
        result = await self._request("GET", "numbers")
        return result.get("data", [])

    async def get_number(self, number_id: str) -> dict:
        """Fetch a single phone number."""
        result = await self._request("GET", f"numbers/{number_id}")
        return result.get("data", result)

    async def allocate_test_number(self, agent_id: str | None = None) -> dict:
        """
        Allocate a sandbox number for free (test keys only).
        POST /v1/numbers  with series=regular
        """
        payload: dict[str, Any] = {"series": "regular"}
        if agent_id or self._agent_id:
            payload["agentId"] = agent_id or self._agent_id
        result = await self._request("POST", "numbers", json=payload)
        return result.get("data", result)

    # -- webhook signature verification ----------------------------------------

    def verify_webhook_signature(
        self,
        raw_body: bytes,
        timestamp: str,
        signature_header: str,
    ) -> bool:
        """
        Verify a Tone webhook delivery.

        Signature algorithm (docs.usetone.ai/webhooks):
          HMAC-SHA256 over "{timestamp}.{raw_body}", hex-encoded, prefixed "v1=".
          The header may contain multiple space-separated "v1=..." values
          during secret rotation -- accept if ANY one matches.

        Reject if timestamp age exceeds 300 seconds.
        """
        if not self._webhook_secret:
            logger.warning("[Tone] No TONE_WEBHOOK_SECRET configured -- skipping sig check.")
            return True  # permissive when unconfigured (dev/test mode)

        # Reject stale deliveries
        try:
            age = abs(time.time() - int(timestamp))
            if age > 300:
                logger.warning(f"[Tone] Webhook timestamp too old: {age:.0f}s")
                return False
        except (ValueError, TypeError):
            logger.warning(f"[Tone] Invalid webhook timestamp: {timestamp!r}")
            return False

        expected = (
            "v1="
            + hmac.new(
                self._webhook_secret.encode(),
                f"{timestamp}.".encode() + raw_body,
                hashlib.sha256,
            ).hexdigest()
        )

        provided = str(signature_header).split(" ")
        for sig in provided:
            if len(sig) == len(expected) and hmac.compare_digest(sig, expected):
                return True

        logger.warning("[Tone] Webhook signature mismatch.")
        return False


# ---------------------------------------------------------------------------
# Mock Tone Client -- development / unit tests (no real API calls)
# ---------------------------------------------------------------------------

class MockToneClient(VoiceClientBase):
    """Mock Tone client that never places real calls."""

    async def initiate_call(
        self,
        from_number: str,
        to_number: str,
        caller_id: str | None = None,
        stream_url: str | None = None,
        status_callback_url: str | None = None,
        extra: dict | None = None,
    ) -> dict:
        logger.info(f"[MOCK Tone] Would call {to_number} (no real API call)")
        return {
            "data": {
                "id": "mock-tone-call-00000000",
                "status": "queued",
                "direction": "outbound",
                "toE164": to_number,
                "disposition": None,
            }
        }

    async def get_call_details(self, call_sid: str) -> dict:
        return {
            "data": {
                "id": call_sid,
                "status": "ended",
                "disposition": "answered",
                "durationSeconds": 0,
            }
        }

    def verify_webhook_signature(
        self, raw_body: bytes, timestamp: str, signature_header: str
    ) -> bool:
        return True


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_tone_client(force_mock: bool = False) -> VoiceClientBase:
    """
    Return the appropriate Tone client based on configuration.

    Priority:
      1. force_mock=True                       -> MockToneClient
      2. TONE_VOICE_ENABLED + creds configured -> ToneVoiceClient
      3. fallback                              -> MockToneClient (logs warning)
    """
    if force_mock:
        return MockToneClient()

    enabled = settings.TONE_VOICE_ENABLED
    api_key = settings.TONE_API_KEY
    agent_id = settings.TONE_AGENT_ID
    number_id = settings.TONE_NUMBER_ID
    base_url = settings.TONE_API_BASE_URL
    webhook_secret = settings.TONE_WEBHOOK_SECRET

    if enabled and api_key and agent_id and number_id:
        return ToneVoiceClient(
            api_key=api_key,
            agent_id=agent_id,
            number_id=number_id,
            base_url=base_url or None,
            webhook_secret=webhook_secret or None,
        )

    if enabled:
        logger.warning(
            "[Tone] TONE_VOICE_ENABLED=true but required credentials are missing. "
            "Set TONE_API_KEY, TONE_AGENT_ID, and TONE_NUMBER_ID to activate real Tone calls."
        )
    return MockToneClient()
