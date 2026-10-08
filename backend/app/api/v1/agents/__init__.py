"""
Agents API — dashboard stats, agent run logs, chat test, CRUD, and WebSocket stream.

GET    /api/v1/agents/stats              — aggregate stats for the dashboard overview
GET    /api/v1/agents/runs              — agent run logs (conversations view)
GET    /api/v1/agents/runs/{run_id}     — single run with tool calls
POST   /api/v1/agents/chat             — test the AI agent with a message (no Twilio needed)
GET    /api/v1/agents/public/list       — list all agents (no auth, dev)
POST   /api/v1/agents/public/create     — create an agent (no auth, dev)
PATCH  /api/v1/agents/public/{id}       — update an agent (no auth, dev)
DELETE /api/v1/agents/public/{id}       — delete an agent (no auth, dev)
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_
from pydantic import BaseModel

from app.database.session import get_db
from app.models.conversation import AgentRun, ToolCall, Call, CallStatus
from app.models.customer import Lead, LeadScore, LeadStatus
from app.models.appointment import Appointment
from app.models.business import Business, BusinessStatus
from app.models.integration import HumanHandoff
from app.models.agent import Agent, AgentConfig, AgentType, AgentStatus

router = APIRouter()


# ── Helper: resolve first business for single-tenant dev ──────────────────────

async def _get_demo_business_id(db: AsyncSession) -> uuid.UUID | None:
    result = await db.execute(select(Business).limit(1))
    biz = result.scalar_one_or_none()
    return biz.id if biz else None


# ── Dashboard Stats ───────────────────────────────────────────────────────────

@router.get("/stats")
async def dashboard_stats(
    business_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Aggregate stats for the dashboard Overview page.
    If business_id is omitted, falls back to the first business in DB (dev mode).
    """
    if business_id is None:
        business_id = await _get_demo_business_id(db)
    if business_id is None:
        # No data at all — return zeros
        return _zero_stats()

    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    # ── Calls ─────────────────────────────────────────────────────────────────
    calls_today = (await db.execute(
        select(func.count()).where(
            Call.business_id == business_id,
            Call.created_at >= today_start,
        )
    )).scalar() or 0

    calls_live = (await db.execute(
        select(func.count()).where(
            Call.business_id == business_id,
            Call.status == CallStatus.IN_PROGRESS,
        )
    )).scalar() or 0

    calls_completed_today = (await db.execute(
        select(func.count()).where(
            Call.business_id == business_id,
            Call.status == CallStatus.COMPLETED,
            Call.created_at >= today_start,
        )
    )).scalar() or 0

    avg_duration = (await db.execute(
        select(func.avg(Call.duration_seconds)).where(
            Call.business_id == business_id,
            Call.status == CallStatus.COMPLETED,
            Call.created_at >= today_start,
        )
    )).scalar()

    # ── Agent Runs ────────────────────────────────────────────────────────────
    runs_today = (await db.execute(
        select(func.count()).where(
            AgentRun.created_at >= today_start
        )
    )).scalar() or 0

    escalated_today = (await db.execute(
        select(func.count()).where(
            AgentRun.status == "escalated",
            AgentRun.created_at >= today_start,
        )
    )).scalar() or 0

    # Intent breakdown (today)
    intent_rows = (await db.execute(
        select(AgentRun.intent, func.count().label("cnt"))
        .where(
            AgentRun.created_at >= today_start,
            AgentRun.intent.isnot(None),
        )
        .group_by(AgentRun.intent)
    )).all()
    intent_breakdown = {row.intent: row.cnt for row in intent_rows}

    # AI handle rate: completed / (completed + escalated), today
    ai_handled = (await db.execute(
        select(func.count()).where(
            AgentRun.status == "completed",
            AgentRun.created_at >= today_start,
        )
    )).scalar() or 0

    total_runs_today = ai_handled + escalated_today
    ai_handle_rate = round((ai_handled / total_runs_today * 100) if total_runs_today else 0)

    # Avg latency today
    avg_latency = (await db.execute(
        select(func.avg(AgentRun.latency_ms)).where(
            AgentRun.created_at >= today_start,
            AgentRun.latency_ms.isnot(None),
        )
    )).scalar()

    # ── Leads ─────────────────────────────────────────────────────────────────
    leads_today = (await db.execute(
        select(func.count()).where(
            Lead.business_id == business_id,
            Lead.created_at >= today_start,
        )
    )).scalar() or 0

    hot_leads = (await db.execute(
        select(func.count()).where(
            Lead.business_id == business_id,
            Lead.score == LeadScore.HOT,
        )
    )).scalar() or 0

    leads_by_stage = (await db.execute(
        select(Lead.status, func.count().label("cnt"))
        .where(Lead.business_id == business_id)
        .group_by(Lead.status)
    )).all()
    stage_breakdown = {row.status.value: row.cnt for row in leads_by_stage}

    # ── Appointments ──────────────────────────────────────────────────────────
    appointments_today = (await db.execute(
        select(func.count()).where(
            Appointment.business_id == business_id,
            Appointment.created_at >= today_start,
        )
    )).scalar() or 0

    # ── Human Handoffs ────────────────────────────────────────────────────────
    handoffs_today = (await db.execute(
        select(func.count()).where(
            HumanHandoff.business_id == business_id,
            HumanHandoff.created_at >= today_start,
        )
    )).scalar() or 0

    return {
        "calls": {
            "today": calls_today,
            "live": calls_live,
            "completed_today": calls_completed_today,
            "avg_duration_seconds": round(avg_duration or 0),
        },
        "ai": {
            "runs_today": runs_today,
            "handled_today": ai_handled,
            "escalated_today": escalated_today,
            "handle_rate_pct": ai_handle_rate,
            "avg_latency_ms": round(avg_latency or 0),
            "intent_breakdown": intent_breakdown,
        },
        "leads": {
            "today": leads_today,
            "hot": hot_leads,
            "stage_breakdown": stage_breakdown,
        },
        "appointments": {
            "today": appointments_today,
        },
        "handoffs": {
            "today": handoffs_today,
        },
    }


def _zero_stats() -> dict:
    return {
        "calls": {"today": 0, "live": 0, "completed_today": 0, "avg_duration_seconds": 0},
        "ai": {"runs_today": 0, "handled_today": 0, "escalated_today": 0,
               "handle_rate_pct": 0, "avg_latency_ms": 0, "intent_breakdown": {}},
        "leads": {"today": 0, "hot": 0, "stage_breakdown": {}},
        "appointments": {"today": 0},
        "handoffs": {"today": 0},
    }


# ── Agent Runs (Conversations view) ───────────────────────────────────────────

@router.get("/runs")
async def list_agent_runs(
    business_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """
    Recent agent runs for the Conversations / AgentLogs dashboard view.
    Intentionally no auth for dev — add get_current_user when ready.
    """
    query = (
        select(AgentRun)
        .order_by(desc(AgentRun.created_at))
        .limit(limit)
    )
    result = await db.execute(query)
    runs = result.scalars().all()

    return [
        {
            "id": str(r.id),
            "status": r.status,
            "intent": r.intent,
            "input_text": r.input_text,
            "output_text": r.output_text,
            "latency_ms": r.latency_ms,
            "created_at": r.created_at.isoformat(),
        }
        for r in runs
    ]


@router.get("/runs/{run_id}")
async def get_agent_run(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Single agent run with all tool calls."""
    run_result = await db.execute(select(AgentRun).where(AgentRun.id == run_id))
    run = run_result.scalar_one_or_none()
    if not run:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Agent run not found")

    tools_result = await db.execute(
        select(ToolCall)
        .where(ToolCall.agent_run_id == run_id)
        .order_by(ToolCall.created_at)
    )
    tools = tools_result.scalars().all()

    return {
        "id": str(run.id),
        "status": run.status,
        "intent": run.intent,
        "input_text": run.input_text,
        "output_text": run.output_text,
        "latency_ms": run.latency_ms,
        "created_at": run.created_at.isoformat(),
        "tool_calls": [
            {
                "tool_name": t.tool_name,
                "status": t.status,
                "latency_ms": t.latency_ms,
                "created_at": t.created_at.isoformat(),
            }
            for t in tools
        ],
    }


# ── Public Agent CRUD (dev / no-auth) ────────────────────────────────────────

class CreateAgentRequest(BaseModel):
    name: str
    agent_type: str = "receptionist"
    greeting_message: Optional[str] = None
    system_prompt: Optional[str] = None
    language: str = "en-IN"
    voice_id: Optional[str] = None
    phone_number: Optional[str] = None
    persona: Optional[dict] = None
    allowed_tools: Optional[list] = None
    escalation_triggers: Optional[list] = None


class UpdateAgentRequest(BaseModel):
    name: Optional[str] = None
    agent_type: Optional[str] = None
    greeting_message: Optional[str] = None
    system_prompt: Optional[str] = None
    language: Optional[str] = None
    voice_id: Optional[str] = None
    phone_number: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    persona: Optional[dict] = None
    allowed_tools: Optional[list] = None
    escalation_triggers: Optional[list] = None


def _agent_to_dict(agent: Agent) -> dict:
    cfg = agent.config
    return {
        "id": str(agent.id),
        "name": agent.name,
        "agent_type": agent.agent_type.value,
        "status": agent.status.value,
        "is_active": agent.is_active,
        "phone_number": agent.phone_number,
        "created_at": agent.created_at.isoformat() if agent.created_at else None,
        "config": {
            "greeting_message": cfg.greeting_message if cfg else None,
            "system_prompt": cfg.system_prompt if cfg else None,
            "language": cfg.language if cfg else "en-IN",
            "voice_id": cfg.voice_id if cfg else None,
            "persona": cfg.persona if cfg else {},
            "allowed_tools": cfg.allowed_tools if cfg else [],
            "escalation_triggers": cfg.escalation_triggers if cfg else [],
            "temperature": cfg.temperature if cfg else 0.3,
        } if cfg else {},
    }


@router.get("/public/list")
async def list_agents_public(db: AsyncSession = Depends(get_db)):
    """List all agents for the first business — no auth (dev mode)."""
    biz = (await db.execute(select(Business).limit(1))).scalar_one_or_none()
    if not biz:
        return []
    result = await db.execute(
        select(Agent).where(Agent.business_id == biz.id).order_by(Agent.created_at)
    )
    agents = result.scalars().all()
    # eager-load configs
    for a in agents:
        await db.refresh(a, ["config"])
    return [_agent_to_dict(a) for a in agents]


@router.post("/public/create", status_code=201)
async def create_agent_public(
    body: CreateAgentRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create an agent for the first business — no auth (dev mode)."""
    biz = (await db.execute(select(Business).limit(1))).scalar_one_or_none()
    if not biz:
        raise HTTPException(status_code=400, detail="No business found. Create a business first via /businesses/public/setup.")

    try:
        agent_type_enum = AgentType(body.agent_type)
    except ValueError:
        agent_type_enum = AgentType.RECEPTIONIST

    agent = Agent(
        business_id=biz.id,
        name=body.name,
        agent_type=agent_type_enum,
        status=AgentStatus.ACTIVE,
        is_active=True,
        phone_number=body.phone_number,
    )
    db.add(agent)
    await db.flush()

    config = AgentConfig(
        agent_id=agent.id,
        greeting_message=body.greeting_message or f"Hello! I'm {body.name}, your AI assistant. How can I help you today?",
        system_prompt=body.system_prompt,
        language=body.language,
        voice_id=body.voice_id or "Polly.Aditi",
        persona=body.persona or {},
        allowed_tools=body.allowed_tools or ["search", "calendar", "crm", "whatsapp"],
        escalation_triggers=body.escalation_triggers or ["speak to human", "manager", "complaint"],
    )
    db.add(config)
    await db.flush()
    await db.refresh(agent, ["config"])
    return _agent_to_dict(agent)


@router.patch("/public/{agent_id}")
async def update_agent_public(
    agent_id: uuid.UUID,
    body: UpdateAgentRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update an agent — no auth (dev mode)."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if body.name is not None:
        agent.name = body.name
    if body.phone_number is not None:
        agent.phone_number = body.phone_number
    if body.is_active is not None:
        agent.is_active = body.is_active
    if body.status is not None:
        try:
            agent.status = AgentStatus(body.status)
        except ValueError:
            pass
    if body.agent_type is not None:
        try:
            agent.agent_type = AgentType(body.agent_type)
        except ValueError:
            pass

    # Update config
    cfg_result = await db.execute(select(AgentConfig).where(AgentConfig.agent_id == agent_id))
    cfg = cfg_result.scalar_one_or_none()
    if not cfg:
        cfg = AgentConfig(agent_id=agent.id)
        db.add(cfg)
    if body.greeting_message is not None:
        cfg.greeting_message = body.greeting_message
    if body.system_prompt is not None:
        cfg.system_prompt = body.system_prompt
    if body.language is not None:
        cfg.language = body.language
    if body.voice_id is not None:
        cfg.voice_id = body.voice_id
    if body.persona is not None:
        cfg.persona = body.persona
    if body.allowed_tools is not None:
        cfg.allowed_tools = body.allowed_tools
    if body.escalation_triggers is not None:
        cfg.escalation_triggers = body.escalation_triggers

    await db.flush()
    await db.refresh(agent, ["config"])
    return _agent_to_dict(agent)


@router.delete("/public/{agent_id}", status_code=204)
async def delete_agent_public(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete an agent — no auth (dev mode)."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.delete(agent)
    await db.flush()
    return
