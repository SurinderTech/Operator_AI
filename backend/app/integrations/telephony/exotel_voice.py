"""
Exotel Voice API client for India telephony.

Official docs: https://developer.exotel.com/
AgentStream:   https://developer.exotel.com/docs/agentstream/connect-voice-ai

Authentication: HTTP Basic Auth — API key as username, API token as password.
Base URL:       configurable per account region (India: api.exotel.com)
"""
from __future__ import annotations

import base64
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings
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
        caller_id: str,
        stream_url: str | None = None,
        status_callback_url: str | None = None,
        extra: dict | None = None,
    ) -> dict:
        raise NotImplementedError

    async def get_call_details(self, call_sid: str) -> dict:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Exotel Voice Client — real provider
# ---------------------------------------------------------------------------

class ExotelVoiceClient(VoiceClientBase):
    """
    Exotel Voice API adapter.

    Required env vars:
        EXOTEL_ACCOUNT_SID    — Exotel Account SID (subdomain)
        EXOTEL_API_KEY        — API key (used as HTTP Basic username)
        EXOTEL_API_TOKEN      — API token (used as HTTP Basic password)
        EXOTEL_API_BASE_URL   — e.g. https://api.exotel.com/v1/Accounts/{sid}
        EXOTEL_CALLER_ID      — ExoPhone / caller ID number

    For Voice AI (AgentStream) calls, also set:
        EXOTEL_STREAM_URL     — wss:// URL of your media stream server
        EXOTEL_APP_OR_FLOW_URL — Exotel App/Flow URL (for inbound call routing)
    """

    def __init__(
        self,
        account_sid: str,
        api_key: str,
        api_token: str,
        api_base_url: str,
        caller_id: str,
    ) -> None:
        if not all([account_sid, api_key, api_token, api_base_url]):
            raise ValueError(
                "EXOTEL_ACCOUNT_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, "
                "and EXOTEL_API_BASE_URL are all required."
            )

        self._account_sid = account_sid
        self._caller_id = caller_id

        # HTTP Basic auth: key:token → base64
        _creds = f"{api_key}:{api_token}"
        self._auth_header = "Basic " + base64.b64encode(_creds.encode()).decode()

        # Normalise base URL
        self._base_url = api_base_url.rstrip("/")

        self._headers = {
            "Authorization": self._auth_header,
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        }

    # ── helpers ────────────────────────────────────────────────────────────

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=4), reraise=True)
    async def _request(self, method: str, endpoint: str, data: dict | None = None) -> dict:
        url = f"{self._base_url}/{endpoint.lstrip('/')}"
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.request(
                method,
                url,
                headers=self._headers,
                data=data,
            )

        if resp.status_code >= 400:
            body = resp.text
            logger.error(f"[Exotel] API error {resp.status_code} at {url}: {body}")
            raise RuntimeError(f"Exotel API {resp.status_code}: {body}")

        return resp.json() if resp.text else {}

    # ── public methods ─────────────────────────────────────────────────────

    async def initiate_call(
        self,
        from_number: str,
        to_number: str,
        caller_id: str | None = None,
        stream_url: str | None = None,
        status_callback_url: str | None = None,
        extra: dict | None = None,
    ) -> dict:
        """
        Place an outbound call via Exotel.

        For standard calls:
            POST /Calls/connect.json
            Params: From, To, CallerId, StatusCallback, ...

        For Voice AI / AgentStream calls (bidirectional streaming):
            Use stream_url to set StreamUrl and StreamType=bidirectional
            See: https://developer.exotel.com/docs/agentstream/connect-voice-ai
        """
        effective_caller_id = caller_id or self._caller_id
        if not effective_caller_id:
            raise ValueError("No caller_id (ExoPhone) configured for outbound call.")

        data: dict[str, str] = {
            "From": from_number,
            "To": to_number,
            "CallerId": effective_caller_id,
        }

        if status_callback_url:
            data["StatusCallback"] = status_callback_url

        if stream_url:
            # Voice AI / AgentStream — bidirectional media streaming
            data["StreamUrl"] = stream_url
            data["StreamType"] = "bidirectional"
            endpoint = "Calls/connect.json"
            logger.info(
                f"[Exotel] Initiating Voice AI call | "
                f"from={from_number} to={to_number} stream={stream_url}"
            )
        else:
            endpoint = "Calls/connect.json"
            logger.info(
                f"[Exotel] Initiating standard call | "
                f"from={from_number} to={to_number}"
            )

        if extra:
            data.update({k: str(v) for k, v in extra.items()})

        result = await self._request("POST", endpoint, data=data)
        call_sid = result.get("Call", {}).get("Sid", "")
        logger.info(f"[Exotel] Call initiated | Sid={call_sid}")
        return result

    async def get_call_details(self, call_sid: str) -> dict:
        """Fetch call detail record."""
        return await self._request("GET", f"Calls/{call_sid}.json")


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
            "Call": {
                "Sid": "mock-call-sid-00000000",
                "Status": "queued",
                "Direction": "outbound-api",
                "From": from_number,
                "To": to_number,
            }
        }

    async def get_call_details(self, call_sid: str) -> dict:
        return {"Call": {"Sid": call_sid, "Status": "completed"}}


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_voice_client(force_mock: bool = False) -> VoiceClientBase:
    """
    Return the appropriate voice client based on configuration.

    Priority:
      1. force_mock=True                  → MockVoiceClient
      2. EXOTEL_VOICE_ENABLED + creds set → ExotelVoiceClient
      3. fallback                         → MockVoiceClient (logs warning)
    """
    if force_mock:
        return MockVoiceClient()

    enabled = settings.EXOTEL_VOICE_ENABLED
    sid = settings.EXOTEL_ACCOUNT_SID
    key = settings.EXOTEL_API_KEY
    token = settings.EXOTEL_API_TOKEN
    base_url = settings.EXOTEL_API_BASE_URL
    caller_id = settings.EXOTEL_CALLER_ID

    if enabled and sid and key and token and base_url:
        return ExotelVoiceClient(
            account_sid=sid,
            api_key=key,
            api_token=token,
            api_base_url=base_url,
            caller_id=caller_id,
        )

    if enabled:
        logger.warning(
            "[Exotel] EXOTEL_VOICE_ENABLED=true but credentials are missing. "
            "Set EXOTEL_ACCOUNT_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, "
            "EXOTEL_API_BASE_URL to activate real voice."
        )
    return MockVoiceClient()
