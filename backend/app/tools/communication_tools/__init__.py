"""
Communication Tools — WhatsApp and notification functions for the agent.
Fully industry-agnostic: works for any business type.
"""
from __future__ import annotations
from typing import Any
from app.core.logging import logger
from app.core.config import settings
from app.models.customer import Customer, Lead


def _get_whatsapp():
    """Return real or mock WhatsApp client."""
    use_mock = not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_WHATSAPP_NUMBER)
    from app.integrations.whatsapp.twilio_whatsapp import get_whatsapp
    if use_mock:
        logger.info("[WhatsApp] No credentials — using MockWhatsApp")
    return get_whatsapp(use_mock=use_mock)


async def send_inquiry_whatsapp(
    customer: Customer,
    items: list[dict] | None = None,
    message: str | None = None,
    business_name: str = "",
    industry: str = "general",
) -> dict[str, Any]:
    """
    Send relevant information cards or a custom message to a customer after an inquiry.
    Works for any industry — if items have structured data, formats them as cards;
    otherwise sends a summary text.

    items: list of RAG result dicts [{content, metadata, similarity}, ...]
    """
    wa = _get_whatsapp()
    try:
        if items:
            # Try to detect if items look like real-estate properties (backward compat)
            first_meta = (items[0].get("metadata", {}) if items else {})
            is_property = (
                first_meta.get("bedrooms") or first_meta.get("price_lakhs") or
                industry in ("real_estate", "property")
            )

            if is_property:
                # Legacy property card format
                properties = _items_to_property_cards(items)
                await wa.send_property_cards(customer.phone, properties)
                return {"status": "sent", "type": "property_cards", "count": len(properties)}
            else:
                # Generic: send a summary text with the top results
                text = _items_to_summary_text(items, business_name, industry)
                sid = await wa.send_text(customer.phone, text)
                return {"status": "sent", "type": "info_summary", "sid": sid}

        elif message:
            sid = await wa.send_text(customer.phone, message)
            return {"status": "sent", "type": "text", "sid": sid}

        return {"status": "skipped", "reason": "no content"}
    except Exception as e:
        logger.error(f"WhatsApp send failed: {e}")
        return {"status": "error", "detail": str(e)}


def _items_to_property_cards(items: list[dict]) -> list[dict]:
    """Convert RAG result items to property card format (backward compat)."""
    cards = []
    for item in items[:3]:
        meta = item.get("metadata", {})
        cards.append({
            "name": meta.get("name", "Property Option"),
            "location": meta.get("location", ""),
            "price_lakhs": meta.get("price_lakhs", meta.get("price", "?")),
            "bedrooms": meta.get("bedrooms", "?"),
            "area_sqft": meta.get("area_sqft", "?"),
            "description": item.get("content", "")[:200],
        })
    return cards


def _items_to_summary_text(items: list[dict], business_name: str, industry: str) -> str:
    """Build a generic WhatsApp summary text from knowledge base results."""
    biz = business_name or "our business"
    lines = [f"📋 *Information from {biz}*\n"]
    for i, item in enumerate(items[:3], 1):
        content = item.get("content", "").strip()[:300]
        if content:
            lines.append(f"{i}. {content}\n")
    lines.append("\n_For more details, please call or visit us._")
    return "\n".join(lines)


# ── Backward compatibility alias ──────────────────────────────────────────────

async def send_lead_whatsapp(
    customer: Customer,
    properties: list[dict] | None = None,
    message: str | None = None,
) -> dict[str, Any]:
    """Legacy alias — send property cards (kept for backward compatibility)."""
    wa = _get_whatsapp()
    try:
        if properties:
            await wa.send_property_cards(customer.phone, properties)
            return {"status": "sent", "type": "property_cards", "count": len(properties)}
        elif message:
            sid = await wa.send_text(customer.phone, message)
            return {"status": "sent", "type": "text", "sid": sid}
        return {"status": "skipped", "reason": "no content"}
    except Exception as e:
        logger.error(f"WhatsApp send failed: {e}")
        return {"status": "error", "detail": str(e)}


async def send_appointment_confirmation(
    customer: Customer,
    appointment: dict,
) -> dict[str, Any]:
    """
    Send appointment confirmation to the customer.
    Works for any business type — service/business_name fields are optional.

    appointment: {date, time, location, service?, business_name?, meet_link?}
    """
    wa = _get_whatsapp()
    try:
        await wa.send_appointment_confirmation(customer.phone, appointment)
        return {"status": "sent", "type": "appointment_confirmation"}
    except Exception as e:
        logger.error(f"WhatsApp confirmation failed: {e}")
        return {"status": "error", "detail": str(e)}


async def notify_team_new_lead(
    team_phone: str,
    customer: Customer,
    lead: Lead | None,
    entities: dict,
    business_name: str = "",
    industry: str = "general",
) -> dict[str, Any]:
    """
    Alert the business team about a hot new lead.
    Message is dynamically built from entities — works for any industry.
    """
    wa = _get_whatsapp()

    budget = entities.get("budget")
    service = entities.get("service_requested", "")
    location = entities.get("location", "")
    score = (lead.score.value.upper() if lead and lead.score else "HOT")
    urgency = entities.get("urgency", "normal")

    # Build a generic lead summary
    details_lines = []
    if service:
        details_lines.append(f"🎯 Service wanted: {service}")
    if location:
        details_lines.append(f"📍 Location: {location}")
    if budget:
        details_lines.append(f"💰 Budget: ₹{budget}")
    if not details_lines:
        details_lines.append("📝 Inquiry details: see conversation")

    details = "\n".join(details_lines)

    message = (
        f"🔥 *New {score} Lead — {business_name or industry.title()}*\n\n"
        f"👤 Customer: {customer.full_name or customer.phone}\n"
        f"📞 Phone: {customer.phone}\n"
        f"⚡ Urgency: {urgency.upper()}\n\n"
        f"{details}\n\n"
        f"_Recommended: Call within 30 minutes_ 📲"
    )

    try:
        sid = await wa.send_text(team_phone, message)
        return {"status": "sent", "type": "team_alert", "sid": sid}
    except Exception as e:
        logger.error(f"Team notification failed: {e}")
        return {"status": "error", "detail": str(e)}


async def notify_human_handoff(
    team_phone: str,
    customer: Customer,
    reason: str,
    conversation_summary: str,
    entities: dict,
    business_name: str = "",
    industry: str = "general",
) -> dict[str, Any]:
    """
    Notify a human agent that they need to take over immediately.
    Message is generic — works for any business.
    """
    wa = _get_whatsapp()

    service = entities.get("service_requested", "")
    location = entities.get("location", "")

    needs_line = ""
    if service:
        needs_line += f"*Wants:* {service}"
    if location:
        needs_line += f" in {location}"
    if entities.get("budget"):
        needs_line += f" @ ₹{entities['budget']}"

    message = (
        f"🚨 *URGENT: Human Handoff Required*\n"
        f"*Business:* {business_name or industry.title()}\n\n"
        f"👤 Customer: {customer.full_name or customer.phone}\n"
        f"📞 Phone: {customer.phone}\n"
        f"⚠️ Reason: {reason}\n"
        f"{needs_line}\n\n"
        f"*Conversation Summary:*\n{conversation_summary[:500]}\n\n"
        f"_Please call immediately_ 📲"
    )
    try:
        sid = await wa.send_text(team_phone, message)
        return {"status": "sent", "sid": sid}
    except Exception as e:
        logger.error(f"Handoff notification failed: {e}")
        return {"status": "error", "detail": str(e)}
