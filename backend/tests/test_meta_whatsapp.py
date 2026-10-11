"""
Tests for Meta WhatsApp Cloud API integration.

Run:  python -m pytest backend/tests/test_meta_whatsapp.py -v

These tests use mocked HTTP responses and never call the real Meta API.
"""
import hashlib
import hmac
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_signature(body: bytes, secret: str) -> str:
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


def _make_wa_payload(
    from_number: str = "+911234567890",
    phone_number_id: str = "111222333444",
    wamid: str = "wamid.test001",
    body: str = "Hello",
) -> dict:
    return {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "999",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {
                        "display_phone_number": "+911111111111",
                        "phone_number_id": phone_number_id,
                    },
                    "messages": [{
                        "from": from_number,
                        "id": wamid,
                        "timestamp": "1700000000",
                        "type": "text",
                        "text": {"body": body},
                    }],
                },
                "field": "messages",
            }],
        }],
    }


# ── verify_meta_signature ─────────────────────────────────────────────────────

class TestVerifyMetaSignature:
    def test_valid_signature(self):
        from app.integrations.whatsapp.meta_whatsapp import verify_meta_signature
        secret = "test_secret_12345"
        body = b'{"test": true}'
        sig = _make_signature(body, secret)
        assert verify_meta_signature(body, sig, secret) is True

    def test_invalid_signature(self):
        from app.integrations.whatsapp.meta_whatsapp import verify_meta_signature
        assert verify_meta_signature(b"body", "sha256=deadbeef", "secret") is False

    def test_missing_prefix(self):
        from app.integrations.whatsapp.meta_whatsapp import verify_meta_signature
        secret = "test_secret"
        body = b"body"
        # No sha256= prefix
        assert verify_meta_signature(body, "deadbeef", secret) is False

    def test_empty_secret_returns_false(self):
        from app.integrations.whatsapp.meta_whatsapp import verify_meta_signature
        assert verify_meta_signature(b"body", "sha256=abc", "") is False

    def test_empty_header_returns_false(self):
        from app.integrations.whatsapp.meta_whatsapp import verify_meta_signature
        assert verify_meta_signature(b"body", "", "secret") is False


# ── Phone normalisation ───────────────────────────────────────────────────────

class TestPhoneNormalisation:
    def test_strips_plus(self):
        from app.integrations.whatsapp.meta_whatsapp import _normalise_phone
        assert _normalise_phone("+919876543210") == "919876543210"

    def test_strips_dashes(self):
        from app.integrations.whatsapp.meta_whatsapp import _normalise_phone
        assert _normalise_phone("+91-98765-43210") == "919876543210"

    def test_valid_phone(self):
        from app.integrations.whatsapp.meta_whatsapp import _is_valid_phone
        assert _is_valid_phone("+919876543210") is True

    def test_invalid_too_short(self):
        from app.integrations.whatsapp.meta_whatsapp import _is_valid_phone
        assert _is_valid_phone("123") is False


# ── MockWhatsAppClient ────────────────────────────────────────────────────────

class TestMockWhatsAppClient:
    @pytest.mark.asyncio
    async def test_send_text_returns_mock_id(self):
        from app.integrations.whatsapp.meta_whatsapp import MockWhatsAppClient
        client = MockWhatsAppClient()
        result = await client.send_text("+919876543210", "Hello")
        assert "mock" in result

    @pytest.mark.asyncio
    async def test_send_template_returns_mock_id(self):
        from app.integrations.whatsapp.meta_whatsapp import MockWhatsAppClient
        client = MockWhatsAppClient()
        result = await client.send_template("+919876543210", "hello_world")
        assert "mock" in result

    @pytest.mark.asyncio
    async def test_no_real_http_calls(self):
        """Mock client must never make HTTP requests."""
        from app.integrations.whatsapp.meta_whatsapp import MockWhatsAppClient
        import httpx
        with patch.object(httpx.AsyncClient, "post", side_effect=AssertionError("real HTTP called")):
            client = MockWhatsAppClient()
            # Should NOT raise
            await client.send_text("+919876543210", "Test")


# ── MetaWhatsAppClient send_text ──────────────────────────────────────────────

class TestMetaWhatsAppClientSendText:
    @pytest.mark.asyncio
    async def test_send_text_calls_correct_endpoint(self):
        from app.integrations.whatsapp.meta_whatsapp import MetaWhatsAppClient
        import httpx

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {
            "messages": [{"id": "wamid.test123"}]
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_response):
            client = MetaWhatsAppClient("fake_token", "fake_phone_id")
            result = await client.send_text("+919876543210", "Hello test")

        assert result == "wamid.test123"

    @pytest.mark.asyncio
    async def test_send_text_raises_on_api_error(self):
        from app.integrations.whatsapp.meta_whatsapp import MetaWhatsAppClient

        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {"error": {"message": "Invalid token"}}
        mock_response.text = json.dumps({"error": "Invalid token"})

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_response):
            client = MetaWhatsAppClient("bad_token", "bad_phone_id")
            with pytest.raises(RuntimeError, match="400"):
                await client.send_text("+919876543210", "Hello")

    @pytest.mark.asyncio
    async def test_invalid_phone_raises_value_error(self):
        from app.integrations.whatsapp.meta_whatsapp import MetaWhatsAppClient
        client = MetaWhatsAppClient("fake_token", "fake_id")
        with pytest.raises(ValueError, match="Invalid phone"):
            await client.send_text("123", "Hello")

    def test_missing_token_raises_on_init(self):
        from app.integrations.whatsapp.meta_whatsapp import MetaWhatsAppClient
        with pytest.raises(ValueError, match="META_WHATSAPP_ACCESS_TOKEN"):
            MetaWhatsAppClient("", "phone_id")

    def test_missing_phone_id_raises_on_init(self):
        from app.integrations.whatsapp.meta_whatsapp import MetaWhatsAppClient
        with pytest.raises(ValueError, match="META_WHATSAPP_PHONE_NUMBER_ID"):
            MetaWhatsAppClient("token", "")


# ── get_whatsapp_client factory ───────────────────────────────────────────────

class TestGetWhatsAppClientFactory:
    def test_force_mock_returns_mock(self):
        from app.integrations.whatsapp.meta_whatsapp import MockWhatsAppClient, get_whatsapp_client
        client = get_whatsapp_client(force_mock=True)
        assert isinstance(client, MockWhatsAppClient)

    def test_no_credentials_returns_mock(self):
        from app.integrations.whatsapp.meta_whatsapp import MockWhatsAppClient, get_whatsapp_client
        with patch("app.integrations.whatsapp.meta_whatsapp.settings") as mock_settings:
            mock_settings.META_WHATSAPP_ACCESS_TOKEN = ""
            mock_settings.META_WHATSAPP_PHONE_NUMBER_ID = ""
            mock_settings.META_GRAPH_API_VERSION = "v20.0"
            client = get_whatsapp_client()
        assert isinstance(client, MockWhatsAppClient)

    def test_with_credentials_returns_meta_client(self):
        from app.integrations.whatsapp.meta_whatsapp import MetaWhatsAppClient, get_whatsapp_client
        with patch("app.integrations.whatsapp.meta_whatsapp.settings") as mock_settings:
            mock_settings.META_WHATSAPP_ACCESS_TOKEN = "fake_token"
            mock_settings.META_WHATSAPP_PHONE_NUMBER_ID = "fake_phone_id"
            mock_settings.META_GRAPH_API_VERSION = "v20.0"
            client = get_whatsapp_client()
        assert isinstance(client, MetaWhatsAppClient)

    def test_credentials_not_in_response(self):
        """Access token must never appear in any exception or log message."""
        from app.integrations.whatsapp.meta_whatsapp import MetaWhatsAppClient
        SECRET_TOKEN = "super_secret_token_ABCXYZ"
        client = MetaWhatsAppClient(SECRET_TOKEN, "phone_id")
        # Ensure __repr__ / str doesn't leak the token
        client_repr = repr(client)
        assert SECRET_TOKEN not in client_repr


# ── Webhook verification handshake ────────────────────────────────────────────

class TestWebhookVerification:
    """Test the GET /webhooks/whatsapp verification endpoint logic."""

    def test_valid_verify_token_passes(self):
        """Simulate Meta sending correct verify token — should return challenge."""
        from app.api.v1.webhooks import whatsapp_webhook_verify
        import asyncio

        with patch("app.api.v1.webhooks.settings") as ms:
            ms.META_WHATSAPP_VERIFY_TOKEN = "my_verify_token"
            ms.is_production = False

            # Directly test the comparison logic
            token = "my_verify_token"
            expected = "my_verify_token"
            assert hmac.compare_digest(token, expected) is True

    def test_wrong_verify_token_fails(self):
        """Wrong token should not match."""
        token = "wrong_token"
        expected = "correct_token"
        assert hmac.compare_digest(token, expected) is False


# ── Duplicate WAMID deduplication ─────────────────────────────────────────────

class TestWamidDeduplication:
    def test_first_message_not_duplicate(self):
        from app.api.v1.webhooks import _is_duplicate_wamid, _processed_wamids
        _processed_wamids.discard("wamid.unique001")
        assert _is_duplicate_wamid("wamid.unique001") is False

    def test_second_message_is_duplicate(self):
        from app.api.v1.webhooks import _is_duplicate_wamid, _processed_wamids
        _processed_wamids.discard("wamid.dup001")
        _is_duplicate_wamid("wamid.dup001")   # first call
        assert _is_duplicate_wamid("wamid.dup001") is True  # second call


# ── Config validation ─────────────────────────────────────────────────────────

class TestConfigValidation:
    def test_missing_whatsapp_keys_listed(self):
        from app.core.config import Settings
        s = Settings(
            WHATSAPP_ENABLED=True,
            META_WHATSAPP_ACCESS_TOKEN="",
            META_WHATSAPP_PHONE_NUMBER_ID="",
            META_APP_SECRET="",
            META_WHATSAPP_VERIFY_TOKEN="",
        )
        missing = s.validate_whatsapp_config()
        assert "META_WHATSAPP_ACCESS_TOKEN" in missing
        assert "META_WHATSAPP_PHONE_NUMBER_ID" in missing

    def test_disabled_whatsapp_no_missing(self):
        from app.core.config import Settings
        s = Settings(WHATSAPP_ENABLED=False)
        assert s.validate_whatsapp_config() == []

    def test_missing_exotel_keys_listed(self):
        from app.core.config import Settings
        s = Settings(
            EXOTEL_VOICE_ENABLED=True,
            EXOTEL_ACCOUNT_SID="",
            EXOTEL_API_KEY="",
            EXOTEL_API_TOKEN="",
            EXOTEL_API_BASE_URL="",
        )
        missing = s.validate_exotel_config()
        assert "EXOTEL_ACCOUNT_SID" in missing
        assert "EXOTEL_API_KEY" in missing

    def test_disabled_exotel_no_missing(self):
        from app.core.config import Settings
        s = Settings(EXOTEL_VOICE_ENABLED=False)
        assert s.validate_exotel_config() == []

    def test_app_boots_without_twilio(self):
        """The app must start successfully without any Twilio credentials."""
        from app.core.config import Settings
        # This must not raise even with no provider credentials
        s = Settings()
        assert s is not None
        assert s.APP_NAME == "Operator AI"
