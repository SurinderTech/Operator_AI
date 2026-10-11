"""Integrations API — list and status of connected services."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database.session import get_db
from app.models.integration import Integration, IntegrationStatus, IntegrationType
from app.models.business import Business
from app.models.user import User
from app.security.auth import get_current_user
from app.core.config import settings

router = APIRouter()


async def _first_business_id(db: AsyncSession) -> uuid.UUID | None:
    result = await db.execute(select(Business).limit(1))
    biz = result.scalar_one_or_none()
    return biz.id if biz else None


def _integration_status_from_env() -> list[dict]:
    """
    Generate integration status from environment config.
    Gives the dashboard a real view of what's configured
    even before Integration DB rows are created.
    """
    wa_missing = settings.validate_whatsapp_config()
    ex_missing = settings.validate_exotel_config()

    return [
        {
            "id": "env-meta-whatsapp",
            "integration_type": "whatsapp",
            "display_name": "Meta WhatsApp Cloud API",
            "status": "connected" if not wa_missing else "disconnected",
            "icon": "💬",
            "description": (
                "Official Meta WhatsApp Cloud API — inbound customer messages, "
                "AI replies, and approved template messages"
            ),
            "config_keys": [
                "META_WHATSAPP_ACCESS_TOKEN",
                "META_WHATSAPP_PHONE_NUMBER_ID",
                "META_APP_SECRET",
                "META_WHATSAPP_VERIFY_TOKEN",
            ],
            "configured": not wa_missing,
            "last_synced_at": None,
            "error_message": (
                None if not wa_missing
                else f"Missing: {', '.join(wa_missing)}"
            ),
        },
        {
            "id": "env-exotel-voice",
            "integration_type": "exotel",
            "display_name": "Exotel Voice (India)",
            "status": "connected" if not ex_missing else "disconnected",
            "icon": "📞",
            "description": (
                "Exotel telephony for India — inbound AI voice calls, "
                "outbound dialling, and AgentStream bidirectional audio"
            ),
            "config_keys": [
                "EXOTEL_ACCOUNT_SID",
                "EXOTEL_API_KEY",
                "EXOTEL_API_TOKEN",
                "EXOTEL_API_BASE_URL",
                "EXOTEL_CALLER_ID",
            ],
            "configured": not ex_missing,
            "last_synced_at": None,
            "error_message": (
                None if not ex_missing
                else f"Missing: {', '.join(ex_missing)}"
            ),
        },
        {
            "id": "env-gemini",
            "integration_type": "gemini",
            "display_name": "Google Gemini AI",
            "status": "connected" if settings.GOOGLE_API_KEY else "disconnected",
            "icon": "🧠",
            "description": f"AI engine — {settings.GEMINI_MODEL} / {settings.GEMINI_FAST_MODEL}",
            "config_keys": ["GOOGLE_API_KEY"],
            "configured": bool(settings.GOOGLE_API_KEY),
            "last_synced_at": None,
            "error_message": None if settings.GOOGLE_API_KEY else "GOOGLE_API_KEY not set",
        },
        {
            "id": "env-hubspot",
            "integration_type": "hubspot",
            "display_name": "HubSpot CRM",
            "status": "connected" if settings.HUBSPOT_ACCESS_TOKEN else "disconnected",
            "icon": "🗂️",
            "description": "CRM — contacts, deals, and lead pipeline sync",
            "config_keys": ["HUBSPOT_ACCESS_TOKEN", "HUBSPOT_PORTAL_ID"],
            "configured": bool(settings.HUBSPOT_ACCESS_TOKEN),
            "last_synced_at": None,
            "error_message": None if settings.HUBSPOT_ACCESS_TOKEN else "HUBSPOT_ACCESS_TOKEN not set",
        },
        {
            "id": "env-google-calendar",
            "integration_type": "google_calendar",
            "display_name": "Google Calendar",
            "status": "connected" if settings.GOOGLE_CALENDAR_CREDENTIALS_JSON else "disconnected",
            "icon": "📅",
            "description": "Calendar access for appointment booking and availability checks",
            "config_keys": ["GOOGLE_CALENDAR_CREDENTIALS_JSON", "GOOGLE_CALENDAR_ID"],
            "configured": bool(settings.GOOGLE_CALENDAR_CREDENTIALS_JSON),
            "last_synced_at": None,
            "error_message": (
                None if settings.GOOGLE_CALENDAR_CREDENTIALS_JSON
                else "Calendar credentials not configured"
            ),
        },
    ]


# ── Public (dev / no auth) ────────────────────────────────────────────────────

@router.get("/public/list")
async def public_list_integrations(db: AsyncSession = Depends(get_db)):
    """
    Integration status — no auth, for dev dashboard.
    Returns env-derived status so dashboard shows real config state.
    """
    return _integration_status_from_env()


@router.get("/public/env-status")
async def public_env_status():
    """Return which env vars are set (boolean presence only — no values)."""
    return {
        "GOOGLE_API_KEY":                       bool(settings.GOOGLE_API_KEY),
        "META_WHATSAPP_ACCESS_TOKEN":           bool(settings.META_WHATSAPP_ACCESS_TOKEN),
        "META_WHATSAPP_PHONE_NUMBER_ID":        bool(settings.META_WHATSAPP_PHONE_NUMBER_ID),
        "META_APP_SECRET":                      bool(settings.META_APP_SECRET),
        "META_WHATSAPP_VERIFY_TOKEN":           bool(settings.META_WHATSAPP_VERIFY_TOKEN),
        "EXOTEL_ACCOUNT_SID":                   bool(settings.EXOTEL_ACCOUNT_SID),
        "EXOTEL_API_KEY":                       bool(settings.EXOTEL_API_KEY),
        "EXOTEL_API_TOKEN":                     bool(settings.EXOTEL_API_TOKEN),
        "EXOTEL_API_BASE_URL":                  bool(settings.EXOTEL_API_BASE_URL),
        "EXOTEL_CALLER_ID":                     bool(settings.EXOTEL_CALLER_ID),
        "EXOTEL_STREAM_URL":                    bool(settings.EXOTEL_STREAM_URL),
        "HUBSPOT_ACCESS_TOKEN":                 bool(settings.HUBSPOT_ACCESS_TOKEN),
        "GOOGLE_CALENDAR_CREDENTIALS_JSON":     bool(settings.GOOGLE_CALENDAR_CREDENTIALS_JSON),
        "ESCALATION_PHONE":                     bool(settings.ESCALATION_PHONE),
        "TEAM_WHATSAPP_PHONE":                  bool(settings.TEAM_WHATSAPP_PHONE),
    }


@router.get("/public/webhook-urls")
async def public_webhook_urls():
    """Return the configured webhook URLs for Meta and Exotel setup."""
    base = settings.effective_webhook_base_url
    return {
        "whatsapp_webhook_url": f"{base}/api/v1/webhooks/whatsapp",
        "whatsapp_verify_token_hint": "Set META_WHATSAPP_VERIFY_TOKEN to your chosen token",
        "exotel_inbound_url": f"{base}/api/v1/webhooks/exotel/inbound",
        "exotel_status_callback_url": f"{base}/api/v1/webhooks/exotel/status",
        "exotel_stream_url": settings.EXOTEL_STREAM_URL or "(not configured)",
        "provider_status_url": f"{base}/api/v1/webhooks/status",
    }


# ── Auth-protected ────────────────────────────────────────────────────────────

@router.get("")
async def list_items(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List integration records from the DB."""
    biz_id = await _first_business_id(db)
    if not biz_id:
        return []
    result = await db.execute(
        select(Integration).where(Integration.business_id == biz_id)
    )
    items = result.scalars().all()
    return [
        {
            "id": str(i.id),
            "integration_type": i.integration_type.value,
            "status": i.status.value,
            "display_name": i.display_name,
            "is_active": i.is_active,
            "last_synced_at": i.last_synced_at.isoformat() if i.last_synced_at else None,
            "error_message": i.error_message,
        }
        for i in items
    ]
