"""
Tests for the Tone API telephony integration.

Tests use mocked HTTP responses -- no real API calls are made.

Run:
    cd backend
    pytest tests/test_tone_voice.py -v
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
import httpx


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

FAKE_API_KEY = "tone_test_abc123def456"
FAKE_AGENT_ID = "agent_test_xyz"
FAKE_NUMBER_ID = "num_test_001"
FAKE_WEBHOOK_SECRET = "whsec_testsecret12345"


@pytest.fixture
def tone_client():
    """Create a ToneVoiceClient with test credentials."""
    from app.integrations.telephony.tone_client import ToneVoiceClient
    return ToneVoiceClient(
        api_key=FAKE_API_KEY,
        agent_id=FAKE_AGENT_ID,
        number_id=FAKE_NUMBER_ID,
        base_url="https://api.usetone.ai",
        webhook_secret=FAKE_WEBHOOK_SECRET,
    )


@pytest.fixture
def mock_tone_client():
    """Create a MockToneClient."""
    from app.integrations.telephony.tone_client import MockToneClient
    return MockToneClient()


# ---------------------------------------------------------------------------
# Client initialisation
# ---------------------------------------------------------------------------

def test_tone_client_detects_test_env(tone_client):
    """A tone_test_ key should mark the client as test mode."""
    assert tone_client._is_test is True


def test_tone_client_detects_live_env():
    """A tone_live_ key should mark the client as live mode."""
    from app.integrations.telephony.tone_client import ToneVoiceClient
    client = ToneVoiceClient(
        api_key="tone_live_abc123",
        agent_id=FAKE_AGENT_ID,
        number_id=FAKE_NUMBER_ID,
    )
    assert client._is_test is False


def test_tone_client_raises_on_missing_key():
    from app.integrations.telephony.tone_client import ToneVoiceClient
    with pytest.raises(ValueError, match="TONE_API_KEY"):
        ToneVoiceClient(api_key="", agent_id=FAKE_AGENT_ID, number_id=FAKE_NUMBER_ID)


def test_tone_client_raises_on_missing_agent_id():
    from app.integrations.telephony.tone_client import ToneVoiceClient
    with pytest.raises(ValueError, match="TONE_AGENT_ID"):
        ToneVoiceClient(api_key=FAKE_API_KEY, agent_id="", number_id=FAKE_NUMBER_ID)


def test_tone_client_raises_on_missing_number_id():
    from app.integrations.telephony.tone_client import ToneVoiceClient
    with pytest.raises(ValueError, match="TONE_NUMBER_ID"):
        ToneVoiceClient(api_key=FAKE_API_KEY, agent_id=FAKE_AGENT_ID, number_id="")


# ---------------------------------------------------------------------------
# Outbound call placement
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_initiate_call_sends_correct_payload(tone_client):
    """initiate_call should POST /v1/calls with agentId, numberId, toE164."""
    expected_response = {
        "data": {
            "id": "call_tone_001",
            "status": "queued",
            "toE164": "+919876543210",
        }
    }

    with patch("httpx.AsyncClient") as mock_cls:
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_resp.text = json.dumps(expected_response)
        mock_resp.json.return_value = expected_response

        mock_client_instance = AsyncMock()
        mock_client_instance.request = AsyncMock(return_value=mock_resp)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_client_instance

        result = await tone_client.initiate_call(
            from_number="+91XXXXXXXXXX",   # ignored by Tone
            to_number="+919876543210",
        )

    # Verify the right endpoint was called
    call_args = mock_client_instance.request.call_args
    assert call_args[0][0] == "POST"
    assert "/v1/calls" in call_args[0][1]

    # Verify request body
    sent_json = call_args[1]["json"]
    assert sent_json["agentId"] == FAKE_AGENT_ID
    assert sent_json["numberId"] == FAKE_NUMBER_ID
    assert sent_json["toE164"] == "+919876543210"

    # Verify idempotency key was sent
    assert "Idempotency-Key" in call_args[1]["headers"]

    # Verify return value
    assert result["data"]["id"] == "call_tone_001"
    assert result["data"]["status"] == "queued"


@pytest.mark.asyncio
async def test_initiate_call_raises_on_api_error(tone_client):
    """initiate_call should raise RuntimeError on 4xx/5xx responses."""
    with patch("httpx.AsyncClient") as mock_cls:
        mock_resp = MagicMock()
        mock_resp.status_code = 422
        mock_resp.text = '{"error":{"code":"invalid_agent"}}'

        mock_client_instance = AsyncMock()
        mock_client_instance.request = AsyncMock(return_value=mock_resp)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_client_instance

        with pytest.raises(RuntimeError, match="Tone API 422"):
            await tone_client._request("POST", "calls", json={})


@pytest.mark.asyncio
async def test_get_call_details(tone_client):
    """get_call_details should GET /v1/calls/{id}."""
    call_id = "call_tone_999"
    expected = {"data": {"id": call_id, "status": "ended", "disposition": "answered"}}

    with patch("httpx.AsyncClient") as mock_cls:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = json.dumps(expected)
        mock_resp.json.return_value = expected

        mock_client_instance = AsyncMock()
        mock_client_instance.request = AsyncMock(return_value=mock_resp)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_client_instance

        result = await tone_client.get_call_details(call_id)

    call_args = mock_client_instance.request.call_args
    assert call_args[0][0] == "GET"
    assert f"/v1/calls/{call_id}" in call_args[0][1]
    assert result["data"]["id"] == call_id


# ---------------------------------------------------------------------------
# Webhook signature verification
# ---------------------------------------------------------------------------

def _make_signature(secret: str, timestamp: str, raw_body: bytes) -> str:
    """Helper: compute the expected Tone HMAC-SHA256 signature."""
    return (
        "v1="
        + hmac.new(
            secret.encode(),
            f"{timestamp}.".encode() + raw_body,
            hashlib.sha256,
        ).hexdigest()
    )


def test_webhook_signature_valid(tone_client):
    """A correctly signed webhook should verify successfully."""
    raw_body = b'{"id":"evt_001","type":"call.completed"}'
    timestamp = str(int(time.time()))
    sig = _make_signature(FAKE_WEBHOOK_SECRET, timestamp, raw_body)

    assert tone_client.verify_webhook_signature(raw_body, timestamp, sig) is True


def test_webhook_signature_invalid(tone_client):
    """A tampered body should fail verification."""
    raw_body = b'{"id":"evt_001","type":"call.completed"}'
    timestamp = str(int(time.time()))
    # Use wrong secret to produce invalid sig
    sig = _make_signature("wrong_secret", timestamp, raw_body)

    assert tone_client.verify_webhook_signature(raw_body, timestamp, sig) is False


def test_webhook_signature_stale_timestamp(tone_client):
    """A timestamp older than 300 s should be rejected."""
    raw_body = b'{"id":"evt_001","type":"call.completed"}'
    timestamp = str(int(time.time()) - 400)
    sig = _make_signature(FAKE_WEBHOOK_SECRET, timestamp, raw_body)

    assert tone_client.verify_webhook_signature(raw_body, timestamp, sig) is False


def test_webhook_signature_rotation(tone_client):
    """Space-separated multiple sigs: accept if any one matches (rotation support)."""
    raw_body = b'{"id":"evt_001","type":"call.completed"}'
    timestamp = str(int(time.time()))
    good_sig = _make_signature(FAKE_WEBHOOK_SECRET, timestamp, raw_body)
    bad_sig = "v1=deadbeef" + "0" * 56  # wrong but same length

    # Both sigs in header -- should pass because good_sig is valid
    multi_sig = f"{bad_sig} {good_sig}"
    assert tone_client.verify_webhook_signature(raw_body, timestamp, multi_sig) is True


def test_webhook_no_secret_permissive(tone_client):
    """When no secret is configured, verification should pass permissively."""
    from app.integrations.telephony.tone_client import ToneVoiceClient
    client = ToneVoiceClient(
        api_key=FAKE_API_KEY,
        agent_id=FAKE_AGENT_ID,
        number_id=FAKE_NUMBER_ID,
        webhook_secret=None,
    )
    # Should return True even with garbage signature
    assert client.verify_webhook_signature(b"{}", "12345", "v1=garbage") is True


# ---------------------------------------------------------------------------
# Mock client
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_mock_tone_client_initiate_call(mock_tone_client):
    """MockToneClient.initiate_call must never raise and return a queued call."""
    result = await mock_tone_client.initiate_call(
        from_number="+91XXXXXXXXXX",
        to_number="+919999999999",
    )
    assert result["data"]["status"] == "queued"
    assert result["data"]["id"] == "mock-tone-call-00000000"


@pytest.mark.asyncio
async def test_mock_tone_client_get_call_details(mock_tone_client):
    result = await mock_tone_client.get_call_details("some-call-id")
    assert result["data"]["status"] == "ended"


def test_mock_tone_client_signature_always_valid(mock_tone_client):
    assert mock_tone_client.verify_webhook_signature(b"{}", "12345", "bad") is True


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def test_get_tone_client_force_mock():
    """force_mock=True must return a MockToneClient regardless of settings."""
    from app.integrations.telephony.tone_client import MockToneClient, get_tone_client
    client = get_tone_client(force_mock=True)
    assert isinstance(client, MockToneClient)


def test_get_tone_client_no_creds_returns_mock():
    """Without TONE_VOICE_ENABLED=true + creds, factory returns mock."""
    from app.integrations.telephony.tone_client import MockToneClient, get_tone_client
    client = get_tone_client(force_mock=False)
    # Default settings have TONE_VOICE_ENABLED=False so mock is expected
    assert isinstance(client, MockToneClient)


# ---------------------------------------------------------------------------
# Provider selector (telephony __init__)
# ---------------------------------------------------------------------------

def test_get_voice_client_defaults_to_tone():
    """get_voice_client() defaults to Tone — returns MockToneClient with force_mock."""
    from app.integrations.telephony import get_voice_client
    from app.integrations.telephony.tone_client import MockToneClient
    client = get_voice_client(force_mock=True)
    assert isinstance(client, MockToneClient)


def test_get_voice_client_tone_provider():
    """get_voice_client() always returns a Tone variant (Tone is the sole provider)."""
    from app.integrations.telephony import get_voice_client
    from app.integrations.telephony.tone_client import MockToneClient

    with patch("app.integrations.telephony.tone_client.settings") as mock_settings:
        mock_settings.TONE_VOICE_ENABLED = False
        mock_settings.TONE_API_KEY = ""
        mock_settings.TONE_AGENT_ID = ""
        mock_settings.TONE_NUMBER_ID = ""
        mock_settings.TONE_API_BASE_URL = "https://api.usetone.ai"
        mock_settings.TONE_WEBHOOK_SECRET = ""

        client = get_voice_client(force_mock=False)
        assert isinstance(client, MockToneClient)

