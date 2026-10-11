"""
Tests for Exotel Voice API integration.

Run:  python -m pytest backend/tests/test_exotel_voice.py -v

These tests use mocked HTTP responses and never place real calls.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── MockVoiceClient ───────────────────────────────────────────────────────────

class TestMockVoiceClient:
    @pytest.mark.asyncio
    async def test_initiate_call_returns_mock_sid(self):
        from app.integrations.telephony.exotel_voice import MockVoiceClient
        client = MockVoiceClient()
        result = await client.initiate_call("+911234567890", "+919876543210", "+911234567890")
        assert "mock" in result["Call"]["Sid"]

    @pytest.mark.asyncio
    async def test_no_real_http_calls(self):
        """Mock must never make HTTP requests."""
        from app.integrations.telephony.exotel_voice import MockVoiceClient
        import httpx
        with patch.object(httpx.AsyncClient, "request", side_effect=AssertionError("real HTTP called")):
            client = MockVoiceClient()
            await client.initiate_call("+911234567890", "+919876543210", "+911234567890")


# ── ExotelVoiceClient init ────────────────────────────────────────────────────

class TestExotelVoiceClientInit:
    def test_missing_account_sid_raises(self):
        from app.integrations.telephony.exotel_voice import ExotelVoiceClient
        with pytest.raises(ValueError, match="EXOTEL_ACCOUNT_SID"):
            ExotelVoiceClient("", "key", "token", "https://api.exotel.com", "")

    def test_missing_api_key_raises(self):
        from app.integrations.telephony.exotel_voice import ExotelVoiceClient
        with pytest.raises(ValueError):
            ExotelVoiceClient("sid", "", "token", "https://api.exotel.com", "")

    def test_valid_init_uses_basic_auth(self):
        """Verify Basic Auth header is set correctly."""
        import base64
        from app.integrations.telephony.exotel_voice import ExotelVoiceClient
        client = ExotelVoiceClient("sid", "mykey", "mytoken", "https://api.exotel.com", "+914040000000")
        expected_creds = base64.b64encode(b"mykey:mytoken").decode()
        assert f"Basic {expected_creds}" == client._auth_header

    def test_credentials_not_in_repr(self):
        from app.integrations.telephony.exotel_voice import ExotelVoiceClient
        SECRET_KEY = "super_secret_api_key_XYZ"
        client = ExotelVoiceClient("sid", SECRET_KEY, "token", "https://api.exotel.com", "")
        assert SECRET_KEY not in repr(client)


# ── ExotelVoiceClient.initiate_call ──────────────────────────────────────────

class TestExotelInitiateCall:
    @pytest.mark.asyncio
    async def test_standard_call_params(self):
        from app.integrations.telephony.exotel_voice import ExotelVoiceClient

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = '{"Call": {"Sid": "exo-test-sid-001", "Status": "queued"}}'
        mock_resp.json.return_value = {"Call": {"Sid": "exo-test-sid-001", "Status": "queued"}}

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_resp) as mock_req:
            client = ExotelVoiceClient("sid", "key", "token", "https://api.exotel.com/v1/Accounts/sid", "+911234567890")
            result = await client.initiate_call("+919876543210", "+911234567890", "+911234567890")

        assert result["Call"]["Sid"] == "exo-test-sid-001"
        call_args = mock_req.call_args
        data_sent = call_args.kwargs.get("data", {})
        assert "From" in data_sent
        assert "To" in data_sent
        assert "CallerId" in data_sent

    @pytest.mark.asyncio
    async def test_voice_ai_call_includes_stream_url(self):
        from app.integrations.telephony.exotel_voice import ExotelVoiceClient

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = '{"Call": {"Sid": "exo-stream-sid-001"}}'
        mock_resp.json.return_value = {"Call": {"Sid": "exo-stream-sid-001"}}

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_resp) as mock_req:
            client = ExotelVoiceClient("sid", "key", "token", "https://api.exotel.com/v1/Accounts/sid", "+911234567890")
            result = await client.initiate_call(
                from_number="+919876543210",
                to_number="+911234567890",
                caller_id="+911234567890",
                stream_url="wss://my-server.example.com/stream",
            )

        data_sent = mock_req.call_args.kwargs.get("data", {})
        assert "StreamUrl" in data_sent
        assert data_sent["StreamType"] == "bidirectional"

    @pytest.mark.asyncio
    async def test_api_error_raises_runtime_error(self):
        from app.integrations.telephony.exotel_voice import ExotelVoiceClient

        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.text = "Unauthorized"
        mock_resp.json.side_effect = Exception()

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_resp):
            # Provide a caller_id so the request reaches the HTTP layer
            client = ExotelVoiceClient(
                "sid", "bad_key", "bad_token",
                "https://api.exotel.com/v1/Accounts/sid",
                "+914040000000",   # caller_id required to reach HTTP call
            )
            with pytest.raises(RuntimeError, match="401"):
                await client.initiate_call("+919876543210", "+911234567890")

    @pytest.mark.asyncio
    async def test_no_caller_id_configured_raises(self):
        from app.integrations.telephony.exotel_voice import ExotelVoiceClient
        client = ExotelVoiceClient("sid", "key", "token", "https://api.exotel.com", "")
        with pytest.raises(ValueError, match="caller_id"):
            await client.initiate_call("+919876543210", "+911234567890")


# ── get_voice_client factory ──────────────────────────────────────────────────

class TestGetVoiceClientFactory:
    def test_force_mock_returns_mock(self):
        from app.integrations.telephony.exotel_voice import MockVoiceClient, get_voice_client
        client = get_voice_client(force_mock=True)
        assert isinstance(client, MockVoiceClient)

    def test_no_credentials_returns_mock(self):
        from app.integrations.telephony.exotel_voice import MockVoiceClient, get_voice_client
        with patch("app.integrations.telephony.exotel_voice.settings") as ms:
            ms.EXOTEL_VOICE_ENABLED = True
            ms.EXOTEL_ACCOUNT_SID = ""
            ms.EXOTEL_API_KEY = ""
            ms.EXOTEL_API_TOKEN = ""
            ms.EXOTEL_API_BASE_URL = ""
            ms.EXOTEL_CALLER_ID = ""
            client = get_voice_client()
        assert isinstance(client, MockVoiceClient)

    def test_disabled_returns_mock(self):
        from app.integrations.telephony.exotel_voice import MockVoiceClient, get_voice_client
        with patch("app.integrations.telephony.exotel_voice.settings") as ms:
            ms.EXOTEL_VOICE_ENABLED = False
            client = get_voice_client()
        assert isinstance(client, MockVoiceClient)

    def test_with_credentials_returns_exotel(self):
        from app.integrations.telephony.exotel_voice import ExotelVoiceClient, get_voice_client
        with patch("app.integrations.telephony.exotel_voice.settings") as ms:
            ms.EXOTEL_VOICE_ENABLED = True
            ms.EXOTEL_ACCOUNT_SID = "test_sid"
            ms.EXOTEL_API_KEY = "test_key"
            ms.EXOTEL_API_TOKEN = "test_token"
            ms.EXOTEL_API_BASE_URL = "https://api.exotel.com/v1/Accounts/test_sid"
            ms.EXOTEL_CALLER_ID = "+914040000000"
            client = get_voice_client()
        assert isinstance(client, ExotelVoiceClient)
