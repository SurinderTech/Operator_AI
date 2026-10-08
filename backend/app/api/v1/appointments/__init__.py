"""
Appointments API — public list endpoint for the dashboard.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database.session import get_db
from app.models.appointment import Appointment, AppointmentStatus
from app.models.business import Business
from app.models.customer import Customer

router = APIRouter()


async def _get_demo_business_id(db: AsyncSession) -> uuid.UUID | None:
    result = await db.execute(select(Business).limit(1))
    biz = result.scalar_one_or_none()
    return biz.id if biz else None


@router.get("/public/list")
async def list_appointments_public(
    limit: int = Query(100, le=500),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List appointments for the first business — no auth (dev mode)."""
    biz_id = await _get_demo_business_id(db)
    if not biz_id:
        return []

    query = (
        select(Appointment)
        .where(Appointment.business_id == biz_id)
        .order_by(desc(Appointment.scheduled_at))
        .limit(limit)
    )
    if status:
        try:
            query = query.where(Appointment.status == AppointmentStatus(status))
        except ValueError:
            pass

    result = await db.execute(query)
    appts = result.scalars().all()

    out = []
    for a in appts:
        # Try to get customer info
        customer_name = "Unknown"
        customer_phone = None
        try:
            cust_result = await db.execute(select(Customer).where(Customer.id == a.customer_id))
            cust = cust_result.scalar_one_or_none()
            if cust:
                customer_name = cust.full_name or "Unknown"
                customer_phone = cust.phone
        except Exception:
            pass

        out.append({
            "id": str(a.id),
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "scheduled_at": a.scheduled_at.isoformat(),
            "duration_minutes": a.duration_minutes,
            "status": a.status.value,
            "service_type": a.title,
            "notes": a.description,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })

    return out
