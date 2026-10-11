"""
Meta WhatsApp Cloud API client.

Official API: https://developers.facebook.com/docs/whatsapp/cloud-api/
Replaces: app.integrations.whatsapp.twilio_whatsapp
"""
from __future__ import annotations

import hashlib
import hmac
import re
import time
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings
from app.core.logging import logger


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalise_phone(phone: str) -> str:
    """
    Normalise a phone number to E.164 format (digits only, no leading +).
    Meta Cloud API requires numbers *without* the leading '+'.
    """
    digits = re.sub(r"[^\d]", "", phone)
    if digits.startswith("0"):
        digits = "91" + digits[1:]   # India default when leading 0 found
    return digits


def _is_valid_phone(phone: str) -> bool:
    digits = _normalise_phone(phone)
    return 7 <= len(digits) <= 15


# ---------------------------------------------------------------------------
# Base interface — so the rest of the codebase is provider-agnostic
# ---------------------------------------------------------------------------

class WhatsAppClientBase:
    """Provider-agnostic WhatsApp interface."""

    async def send_text(self, to: str, message: str) -> str:
        raise NotImplementedError

    async def send_template(self, to: str, template_name: str,
                            language_code: str = "en_US",
                            components: list[dict] | None = None) -> str:
        raise NotImplementedError

    async def send_property_cards(self, to: str, properties: list[dict]) -> None:
        if not properties:
            await self.send_text(to, "No items found matching your requirements.")
            return
        header = f"🏠 *Found {len(properties)} options for you:*\n"
        cards = []
        for i, prop in enumerate(properties[:3], 1):
            card = (
                f"\n*{i}. {prop.get('name', 'Option')}*\n"
                f"📍 {prop.get('location', 'Location TBD')}\n"
                f"💰 ₹{prop.get('price_lakhs', '?')} Lakhs\n"
                f"🛏️ {prop.get('bedrooms', '?')} BHK | {prop.get('area_sqft', '?')} sq.ft.\n"
                f"📞 Reply with 'BOOK' to schedule a visit"
            )
            cards.append(card)
        await self.send_text(to, header + "\n".join(cards))

    async def send_appointment_confirmation(self, to: str, appointment: dict) -> None:
        message = (
            f"✅ *Appointment Confirmed!*\n\n"
            f"📅 *Date:* {appointment.get('date', 'TBD')}\n"
            f"⏰ *Time:* {appointment.get('time', 'TBD')}\n"
            f"📍 *Location:* {appointment.get('location', 'TBD')}\n\n"
            f"Our team will meet you there. See you soon! 🙏\n\n"
            f"_To reschedule, reply RESCHEDULE_"
        )
        await self.send_text(to, message)

    async def send_lead_summary_to_team(self, team_phone: str, lead_summary: dict) -> None:
        message = (
            f"🔥 *New Hot Lead!*\n\n"
            f"👤 {lead_summary.get('name', 'Unknown')}\n"
            f"📞 {lead_summary.get('phone', '')}\n"
            f"🏠 {lead_summary.get('requirement', '')}\n"
            f"💰 Budget: ₹{lead_summary.get('budget_lakhs', '?')} Lakhs\n"
            f"📍 {lead_summary.get('location', '')}\n\n"
            f"*Intent:* {lead_summary.get('intent', '')}\n"
            f"*Recommended action:* {lead_summary.get('recommended_action', 'Call customer')}"
        )
        await self.send_text(team_phone, message)


# ---------------------------------------------------------------------------
# Meta WhatsApp Cloud API — real provider
# ---------------------------------------------------------------------------

class MetaWhatsAppClient(WhatsAppClientBase):
    """
    Sends messages via the official Meta WhatsApp Cloud API.

    Required env vars:
        META_WHATSAPP_ACCESS_TOKEN    — permanent system user token
        META_WHATSAPP_PHONE_NUMBER_ID — Phone Number ID (not the phone number)
        META_GRAPH_API_VERSION        — e.g. "v20.0"
    """

    def __init__(
        self,
        access_token: str,
        phone_number_id: str,
        graph_api_version: str = "v20.0",
    ) -> None:
        if not access_token:
            raise ValueError("META_WHATSAPP_ACCESS_TOKEN is required")
        if not phone_number_id:
            raise ValueError("META_WHATSAPP_PHONE_NUMBER_ID is required")

        self._token = access_token
        self._phone_number_id = phone_number_id
        self._base_url = (
            f"https://graph.facebook.com/{graph_api_version}"
            f"/{phone_number_id}/messages"
        )
        self._headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }
        self._sent_ids: set[str] = set()  # in-process duplicate guard

    # ── internal request helper ────────────────────────────────────────────

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type(httpx.TransportError),
        reraise=True,
    )
    async def _post(self, payload: dict) -> dict:
        """POST to Meta Graph API with retry on transient network errors."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                self._base_url,
                headers=self._headers,
                json=payload,
            )
        if resp.status_code == 429:
            logger.warning("[Meta WA] Rate-limited by Meta — backing off")
            time.sleep(5)
            raise httpx.TransportError("rate_limited")

        if resp.status_code >= 400:
            body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text
            logger.error(f"[Meta WA] API error {resp.status_code}: {body}")
            raise RuntimeError(f"Meta WhatsApp API {resp.status_code}: {body}")

        return resp.json()

    # ── public send methods ────────────────────────────────────────────────

    async def send_text(self, to: str, message: str) -> str:
        """Send a plain text WhatsApp message. Returns wamid (message ID)."""
        if not _is_valid_phone(to):
            raise ValueError(f"Invalid phone number: {to!r}")

        recipient = _normalise_phone(to)
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient,
            "type": "text",
            "text": {"preview_url": False, "body": message},
        }

        data = await self._post(payload)
        message_id: str = data.get("messages", [{}])[0].get("id", "")
        self._sent_ids.add(message_id)
        logger.info(f"[Meta WA] ✅ Text sent to {recipient} | wamid={message_id}")
        return message_id

    async def send_template(
        self,
        to: str,
        template_name: str,
        language_code: str = "en_US",
        components: list[dict] | None = None,
    ) -> str:
        """Send an approved template message (required outside 24-h window)."""
        if not _is_valid_phone(to):
            raise ValueError(f"Invalid phone number: {to!r}")

        recipient = _normalise_phone(to)
        template_payload: dict[str, Any] = {
            "name": template_name,
            "language": {"code": language_code},
        }
        if components:
            template_payload["components"] = components

        payload = {
            "messaging_product": "whatsapp",
            "to": recipient,
            "type": "template",
            "template": template_payload,
        }

        data = await self._post(payload)
        message_id: str = data.get("messages", [{}])[0].get("id", "")
        logger.info(f"[Meta WA] ✅ Template '{template_name}' sent to {recipient} | wamid={message_id}")
        return message_id


# ---------------------------------------------------------------------------
# Mock provider — development / unit tests (never calls Meta)
# ---------------------------------------------------------------------------

class MockWhatsAppClient(WhatsAppClientBase):
    """Development mock. Logs instead of sending real messages."""

    async def send_text(self, to: str, message: str) -> str:
        logger.info(f"[MOCK WA] → {to}: {message[:80]}")
        return "mock-wamid-00000000"

    async def send_template(self, to: str, template_name: str,
                            language_code: str = "en_US",
                            components: list[dict] | None = None) -> str:
        logger.info(f"[MOCK WA] Template '{template_name}' → {to}")
        return "mock-wamid-template"

    async def send_property_cards(self, to: str, properties: list[dict]) -> None:
        logger.info(f"[MOCK WA] {len(properties)} property cards → {to}")

    async def send_appointment_confirmation(self, to: str, appointment: dict) -> None:
        logger.info(f"[MOCK WA] Appointment confirmation → {to}: {appointment}")

    async def send_lead_summary_to_team(self, team_phone: str, lead_summary: dict) -> None:
        logger.info(f"[MOCK WA] Lead summary → {team_phone}: {lead_summary}")


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_whatsapp_client(force_mock: bool = False) -> WhatsAppClientBase:
    """
    Return the appropriate WhatsApp client based on configuration.

    Priority:
      1. force_mock=True                    → MockWhatsAppClient
      2. META_WHATSAPP_ACCESS_TOKEN present → MetaWhatsAppClient
      3. fallback                           → MockWhatsAppClient (logs warning)
    """
    if force_mock:
        return MockWhatsAppClient()

    token = settings.META_WHATSAPP_ACCESS_TOKEN
    phone_id = settings.META_WHATSAPP_PHONE_NUMBER_ID
    version = settings.META_GRAPH_API_VERSION or "v20.0"

    if token and phone_id:
        return MetaWhatsAppClient(
            access_token=token,
            phone_number_id=phone_id,
            graph_api_version=version,
        )

    logger.warning(
        "[Meta WA] META_WHATSAPP_ACCESS_TOKEN or META_WHATSAPP_PHONE_NUMBER_ID "
        "not set — falling back to MockWhatsAppClient. "
        "Set WHATSAPP_ENABLED=true and provide credentials to use Meta Cloud API."
    )
    return MockWhatsAppClient()


# ---------------------------------------------------------------------------
# Webhook signature verification (used by webhook handler)
# ---------------------------------------------------------------------------

def verify_meta_signature(raw_body: bytes, signature_header: str, app_secret: str) -> bool:
    """
    Verify X-Hub-Signature-256 from Meta webhook request.
    Returns True if the signature is valid.
    Uses constant-time comparison to prevent timing attacks.
    """
    if not signature_header or not app_secret:
        return False
    if not signature_header.startswith("sha256="):
        return False
    expected_sig = signature_header[len("sha256="):]
    computed = hmac.new(
        app_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed, expected_sig)
