"""Businesses CRUD endpoints."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from slugify import slugify
from app.database.session import get_db
from app.models.user import User
from app.models.business import Business, BusinessUser, BusinessUserRole, BusinessStatus
from app.security.auth import get_current_user

router = APIRouter()


class CreateBusinessRequest(BaseModel):
    name: str
    industry: str
    phone: str | None = None
    email: str | None = None
    timezone: str = "Asia/Kolkata"
    services: list[str] = []
    working_hours: dict | None = None


class BusinessResponse(BaseModel):
    id: str
    name: str
    slug: str
    industry: str
    status: str
    phone: str | None
    services: list | None

    class Config:
        from_attributes = True


@router.post("", response_model=BusinessResponse, status_code=201)
async def create_business(
    body: CreateBusinessRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    slug_base = slugify(body.name)
    slug = slug_base
    counter = 1
    while True:
        existing = await db.execute(select(Business).where(Business.slug == slug))
        if not existing.scalar_one_or_none():
            break
        slug = f"{slug_base}-{counter}"
        counter += 1

    business = Business(
        name=body.name,
        slug=slug,
        industry=body.industry,
        phone=body.phone,
        email=body.email,
        timezone=body.timezone,
        services=body.services,
        working_hours=body.working_hours,
        status=BusinessStatus.ONBOARDING,
    )
    db.add(business)
    await db.flush()

    # Link the creating user as owner
    bu = BusinessUser(
        business_id=business.id,
        user_id=current_user.id,
        role=BusinessUserRole.OWNER,
    )
    db.add(bu)

    return business


@router.get("", response_model=list[BusinessResponse])
async def list_businesses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Business)
        .join(BusinessUser, BusinessUser.business_id == Business.id)
        .where(BusinessUser.user_id == current_user.id, Business.is_active == True)
    )
    return result.scalars().all()


@router.get("/{business_id}", response_model=BusinessResponse)
async def get_business(
    business_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Business).where(Business.id == business_id))
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


# ── Public (dev / no-auth) profile endpoints ──────────────────────────────────

class PublicProfileResponse(BaseModel):
    id: str
    name: str
    industry: str
    phone: Optional[str]
    email: Optional[str]
    website: Optional[str]
    timezone: str
    working_hours: dict
    services: Optional[list]
    status: str
    settings: dict

    class Config:
        from_attributes = True


class PublicProfileUpdate(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    timezone: Optional[str] = None
    working_hours: Optional[dict] = None
    services: Optional[list] = None
    settings: Optional[dict] = None


@router.get("/public/profile", response_model=PublicProfileResponse)
async def public_get_profile(db: AsyncSession = Depends(get_db)):
    """Return the first business profile — no auth required (dev mode)."""
    result = await db.execute(select(Business).where(Business.is_active == True).limit(1))
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(status_code=404, detail="No business found. Create one first.")
    return PublicProfileResponse(
        id=str(business.id),
        name=business.name,
        industry=business.industry,
        phone=business.phone,
        email=business.email,
        website=business.website,
        timezone=business.timezone,
        working_hours=business.working_hours or {},
        services=business.services,
        status=business.status.value,
        settings=business.settings or {},
    )


@router.post("/public/setup", status_code=201)
async def public_setup(
    body: CreateBusinessRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    One-shot setup: create a Business + default active Agent.
    No auth required (dev mode). Safe to call multiple times — returns existing if already set up.
    """
    from app.models.agent import Agent, AgentConfig, AgentType, AgentStatus

    existing = (await db.execute(select(Business).where(Business.is_active == True).limit(1))).scalar_one_or_none()
    if existing:
        agent_result = await db.execute(select(Agent).where(Agent.business_id == existing.id).limit(1))
        agent = agent_result.scalar_one_or_none()
        return {
            "business_id": str(existing.id),
            "business_name": existing.name,
            "agent_id": str(agent.id) if agent else None,
            "agent_name": agent.name if agent else None,
            "already_exists": True,
        }

    slug_base = slugify(body.name)
    slug = slug_base
    counter = 1
    while True:
        ex = (await db.execute(select(Business).where(Business.slug == slug))).scalar_one_or_none()
        if not ex:
            break
        slug = f"{slug_base}-{counter}"
        counter += 1

    business = Business(
        name=body.name, slug=slug, industry=body.industry,
        phone=body.phone, email=body.email, timezone=body.timezone,
        services=body.services, status=BusinessStatus.ACTIVE,
    )
    db.add(business)
    await db.flush()

    agent = Agent(
        business_id=business.id,
        name=f"{body.name} AI Receptionist",
        agent_type=AgentType.RECEPTIONIST,
        status=AgentStatus.ACTIVE,
        is_active=True,
    )
    db.add(agent)
    await db.flush()

    config = AgentConfig(
        agent_id=agent.id,
        greeting_message=f"Hello! Thank you for contacting {body.name}. How can I help you today?",
        language="en-IN", voice_id="Polly.Aditi",
        allowed_tools=["search", "calendar", "crm", "whatsapp"],
        escalation_triggers=["speak to human", "manager", "complaint", "urgent"],
        persona={"business_name": body.name, "industry": body.industry},
    )
    db.add(config)
    await db.flush()

    return {
        "business_id": str(business.id),
        "business_name": business.name,
        "agent_id": str(agent.id),
        "agent_name": agent.name,
        "already_exists": False,
    }


@router.patch("/public/profile", response_model=PublicProfileResponse)
async def public_update_profile(
    body: PublicProfileUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update the first business profile — no auth required (dev mode)."""
    result = await db.execute(select(Business).where(Business.is_active == True).limit(1))
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(status_code=404, detail="No business found.")

    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(business, field, value)

    await db.flush()
    await db.refresh(business)
    return PublicProfileResponse(
        id=str(business.id),
        name=business.name,
        industry=business.industry,
        phone=business.phone,
        email=business.email,
        website=business.website,
        timezone=business.timezone,
        working_hours=business.working_hours or {},
        services=business.services,
        status=business.status.value,
        settings=business.settings or {},
    )
