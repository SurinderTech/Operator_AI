"""
CRM Tools — callable functions the agent invokes to interact with the CRM.

These bridge the agent (LangGraph nodes) to the CRM integration layer.
Business ID is used to fetch the right credentials from the DB.
Industry-agnostic: works for real estate, healthcare, automotive, retail, etc.
"""
from __future__ import annotations
import uuid
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.logging import logger
from app.integrations.crm.hubspot import CRMLead, get_crm
from app.models.customer import Customer, Lead, LeadStatus, LeadScore


async def _get_crm_for_business(business_id: str, db: AsyncSession):
    """Return real HubSpot CRM if token is configured, otherwise MockCRM."""
    from app.core.config import settings

    # Always use real HubSpot when token is present — no DB record required
    if settings.HUBSPOT_ACCESS_TOKEN:
        logger.info("[CRM] Using real HubSpot CRM")
        return get_crm("hubspot")

    logger.info("[CRM] HUBSPOT_ACCESS_TOKEN not set — using MockCRM")
    return get_crm("mock")


async def get_or_create_customer(
    business_id: str,
    phone: str,
    db: AsyncSession,
    full_name: str | None = None,
    email: str | None = None,
) -> Customer:
    """Find existing customer by phone or create a new one."""
    result = await db.execute(
        select(Customer).where(
            Customer.business_id == uuid.UUID(business_id),
            Customer.phone == phone,
        )
    )
    customer = result.scalar_one_or_none()

    if not customer:
        customer = Customer(
            business_id=uuid.UUID(business_id),
            phone=phone,
            full_name=full_name,
            email=email,
        )
        db.add(customer)
        await db.flush()
        logger.info(f"👤 New customer created: {phone}")
    elif full_name and not customer.full_name:
        customer.full_name = full_name

    return customer


def _score_lead(entities: dict, business_industry: str) -> LeadScore:
    """
    Score a lead based on urgency and budget.
    Works for any industry — uses urgency field as the primary signal,
    with budget as a secondary signal when present.
    """
    # Urgency is the most reliable cross-industry signal
    urgency = (entities.get("urgency") or "normal").lower()
    if urgency == "high":
        return LeadScore.HOT
    if urgency == "low":
        return LeadScore.COLD

    # Budget-based scoring (applies to any industry with a monetary value)
    budget = entities.get("budget")
    if budget:
        try:
            # Normalise: strip currency symbols, commas
            budget_val = float(
                str(budget)
                .replace(",", "")
                .replace("₹", "")
                .replace("$", "")
                .replace("L", "")
                .strip()
            )
            # In lakhs or raw rupees — raw rupees ≥50L = HOT
            if budget_val >= 5_000_000 or budget_val >= 50:
                return LeadScore.HOT
            if budget_val >= 2_000_000 or budget_val >= 20:
                return LeadScore.WARM
        except (ValueError, TypeError):
            pass

    return LeadScore.WARM  # default — any genuine inquiry is at least warm


def _build_lead_title(entities: dict, business_industry: str) -> str:
    """Build a human-readable lead title for any industry."""
    service = entities.get("service_requested")
    location = entities.get("location")
    industry = (business_industry or "general").lower()

    # Industry-specific formatting
    if industry in ("real_estate", "property"):
        bedrooms = entities.get("bedrooms") or entities.get("quantity")
        prop_type = service or "Property"
        parts = [f"{bedrooms}BHK" if bedrooms else prop_type]
        if location:
            parts.append(f"in {location}")
        return " ".join(parts) + " inquiry"

    if industry in ("healthcare", "clinic", "medical"):
        parts = [service or "Medical consultation"]
        if location:
            parts.append(f"at {location}")
        return " — ".join(parts)

    if industry in ("automotive", "car_dealership"):
        parts = [service or "Vehicle inquiry"]
        if location:
            parts.append(f"in {location}")
        return " ".join(parts)

    # Generic fallback
    parts = [service or "Service inquiry"]
    if location:
        parts.append(f"({location})")
    return " ".join(parts)


async def create_lead(
    business_id: str,
    customer: Customer,
    entities: dict,
    db: AsyncSession,
    business_industry: str = "general",
) -> dict[str, Any]:
    """
    Create a Lead in the local DB and sync to CRM.
    Works for any industry — scoring and title are derived dynamically.

    entities: {budget, location, service_requested, quantity, urgency, ...}
    Returns: {lead_id, crm_id, score, status}
    """
    score = _score_lead(entities, business_industry)

    # Build requirements dict — store all extracted entities
    requirements = {
        k: v for k, v in entities.items()
        if v is not None and k not in ("customer_name",)
    }

    budget = entities.get("budget")
    title = _build_lead_title(entities, business_industry)

    lead = Lead(
        business_id=uuid.UUID(business_id),
        customer_id=customer.id,
        title=title,
        status=LeadStatus.NEW,
        score=score,
        budget=float(budget) if budget else None,
        requirements=requirements,
    )
    db.add(lead)
    await db.flush()
    logger.info(f"📋 Lead created: {lead.id} | industry={business_industry} | score={score.value}")

    # Sync to CRM
    crm_id: str | None = None
    try:
        crm = await _get_crm_for_business(business_id, db)
        crm_lead = CRMLead(
            id=None,
            full_name=customer.full_name or "Unknown",
            phone=customer.phone,
            email=customer.email,
            budget=lead.budget,
            requirements=requirements,
            status="NEW",
            score=score.value.upper(),
            notes=f"Lead created by AI agent. Industry: {business_industry}. Requirements: {requirements}",
        )
        crm_id = await crm.create_lead(crm_lead)
        lead.crm_id = crm_id
        lead.crm_provider = "hubspot"
        if customer.crm_id is None:
            customer.crm_id = crm_id
        logger.info(f"✅ CRM lead synced: {crm_id}")
    except Exception as e:
        logger.error(f"CRM sync failed (non-fatal): {e}")

    return {
        "lead_id": str(lead.id),
        "crm_id": crm_id,
        "score": score.value,
        "status": "created",
        "title": title,
    }


async def update_lead_stage(
    business_id: str,
    lead_id: str,
    stage: str,
    note: str | None = None,
    db: AsyncSession = None,
) -> dict[str, Any]:
    """Advance a lead's pipeline stage and optionally add a CRM note."""
    result = await db.execute(select(Lead).where(Lead.id == uuid.UUID(lead_id)))
    lead = result.scalar_one_or_none()
    if not lead:
        return {"status": "error", "detail": "Lead not found"}

    lead.status = LeadStatus(stage)
    await db.flush()

    if lead.crm_id:
        try:
            crm = await _get_crm_for_business(business_id, db)
            await crm.change_stage(lead.crm_id, stage)
            if note:
                await crm.add_note(lead.crm_id, note)
        except Exception as e:
            logger.error(f"CRM stage update failed: {e}")

    return {"status": "updated", "stage": stage, "lead_id": lead_id}


async def add_crm_note(
    business_id: str,
    lead: Lead,
    note: str,
    db: AsyncSession,
) -> bool:
    """Add a note to the lead's CRM record."""
    if not lead.crm_id:
        return False
    try:
        crm = await _get_crm_for_business(business_id, db)
        return await crm.add_note(lead.crm_id, note)
    except Exception as e:
        logger.error(f"add_crm_note failed: {e}")
        return False
