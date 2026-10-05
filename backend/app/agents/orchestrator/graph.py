"""
AI Orchestrator — the central brain using LangGraph.

Graph:
  START → receptionist → intent_classifier → router
                                               ├─ lead_agent    → responder → END
                                               ├─ booking_agent → responder → END
                                               ├─ support_agent → responder → END
                                               └─ human_handoff → END

Every node:
  - Uses real tool calls (CRM, Calendar, WhatsApp, RAG)
  - Persists AgentRun + ToolCall records to DB
  - Loads from and writes to customer memory
  - Is fully industry-agnostic — works for real estate, clinics,
    auto dealers, restaurants, salons, law firms, or any business.
"""
from __future__ import annotations
import json
import time
import uuid
from datetime import datetime, timezone
from typing import TypedDict, Annotated, Literal, Any

from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger


# ── Agent State ───────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    # ── Identifiers ──────────────────────────────────────────────────────────
    conversation_id: str
    business_id: str
    customer_phone: str
    agent_run_id: str | None   # set after AgentRun row is created

    # ── Business context (loaded once per call) ───────────────────────────────
    business_name: str          # e.g. "Dr. Patel Clinic"
    business_industry: str      # e.g. "healthcare", "real_estate", "automotive"
    business_services: list     # e.g. ["Consultation", "X-Ray", "Blood Test"]
    business_description: str   # free text from Business.description

    # ── Input ────────────────────────────────────────────────────────────────
    user_input: str

    # ── Context (loaded at start) ────────────────────────────────────────────
    conversation_history: list[dict]
    customer_memory: dict            # from Customer.preferences
    business_context: str            # top RAG chunks

    # ── AI Decisions ─────────────────────────────────────────────────────────
    intent: str
    entities: dict
    plan: list[str]

    # ── Tool Results ─────────────────────────────────────────────────────────
    tool_results: dict

    # ── Output ───────────────────────────────────────────────────────────────
    response: str
    escalate: bool
    escalation_reason: str
    next_action: str   # continue | end_call | human_handoff

    # ── Runtime (injected, not part of LangGraph routing) ────────────────────
    _db: Any | None


# ── LLM helper ───────────────────────────────────────────────────────────────

def _llm(fast: bool = False) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=settings.GEMINI_FAST_MODEL if fast else settings.GEMINI_MODEL,
        google_api_key=settings.GOOGLE_API_KEY,
        temperature=0.3,
    )


def _db(state: AgentState) -> AsyncSession | None:
    return state.get("_db")


# ── Observability helpers ─────────────────────────────────────────────────────

async def _log_tool_call(
    agent_run_id: str,
    tool_name: str,
    input_args: dict,
    output: dict,
    status: str,
    latency_ms: int,
    db: AsyncSession,
) -> None:
    """Persist a ToolCall row for observability."""
    from app.models.conversation import ToolCall
    tc = ToolCall(
        agent_run_id=uuid.UUID(agent_run_id),
        tool_name=tool_name,
        input_args=input_args,
        output=output,
        status=status,
        latency_ms=latency_ms,
    )
    db.add(tc)
    try:
        await db.flush()
    except Exception as e:
        logger.warning(f"ToolCall flush failed: {e}")


# ── Business context helpers ──────────────────────────────────────────────────

async def _load_business_context(business_id: str, db: AsyncSession) -> dict:
    """
    Load the Business row and return industry/name/services for prompt injection.
    Falls back to safe defaults so no node crashes.
    """
    try:
        from sqlalchemy import select
        from app.models.business import Business
        result = await db.execute(select(Business).where(Business.id == uuid.UUID(business_id)))
        biz = result.scalar_one_or_none()
        if biz:
            return {
                "name": biz.name or "the business",
                "industry": (biz.industry or "general").lower().replace(" ", "_"),
                "services": biz.services or [],
                "description": biz.description or "",
                "settings": biz.settings or {},
                "team_phone": (biz.settings or {}).get("team_phone", ""),
            }
    except Exception as e:
        logger.error(f"Business context load failed: {e}")
    return {
        "name": "the business",
        "industry": "general",
        "services": [],
        "description": "",
        "settings": {},
        "team_phone": "",
    }


def _build_intent_prompt(
    industry: str,
    business_name: str,
    services: list,
    business_description: str,
) -> str:
    """
    Dynamically build the intent classification prompt.
    Works for ANY industry — the LLM infers relevant intents from context.
    """
    services_str = ", ".join(services) if services else "various services"

    return f"""You are an intent classifier for an AI assistant working for:

Business: {business_name}
Industry: {industry}
Services offered: {services_str}
Description: {business_description}

Classify the customer's message into ONE of these universal intents:
- inquiry:            customer asking about services, products, availability, pricing
- appointment_request: customer wants to book/schedule/confirm/cancel an appointment or visit
- support:            general question, status check, how-to, FAQ
- complaint:          expressing frustration, anger, dissatisfaction, bad experience
- follow_up:          asking about a prior interaction, order, case, or booking
- out_of_scope:       completely unrelated to the business

Extract entities relevant to this business. Use null for anything not mentioned:
- budget:            numeric value (raw number, or null)
- location:          city, area, branch name (or null)
- service_requested: specific service they want (or null)
- quantity:          numeric quantity if mentioned (or null)
- preferred_datetime: ISO datetime string if any date/time is mentioned (or null)
- customer_name:     if the customer introduced themselves (or null)
- urgency:           "high" | "normal" | "low" (default "normal")

Respond ONLY with valid JSON — no markdown, no explanation:
{{
  "intent": "...",
  "confidence": 0.0,
  "entities": {{
    "budget": null,
    "location": null,
    "service_requested": null,
    "quantity": null,
    "preferred_datetime": null,
    "customer_name": null,
    "urgency": "normal"
  }},
  "requires_escalation": false,
  "escalation_reason": null
}}"""


def _build_responder_prompt(
    industry: str,
    business_name: str,
) -> str:
    """
    Build the responder system prompt for any industry.
    """
    return f"""You are a warm, professional AI assistant for {business_name} ({industry}).
You are speaking to a customer on the phone or via WhatsApp.

Rules:
- Keep responses under 3 sentences for voice (conversational, not formal).
- Address the customer by first name if known.
- Confirm actions that were taken (appointment booked, inquiry logged, etc.).
- If an appointment was booked, state the exact time clearly.
- If relevant items were found, briefly mention how many.
- If WhatsApp was sent, mention you've sent details there.
- Sound human, warm, and helpful — never robotic.
- For Indian businesses, use ₹ naturally.
- Do NOT make up information not in the context."""


# ── Graph Nodes ───────────────────────────────────────────────────────────────

async def receptionist_node(state: AgentState) -> AgentState:
    """
    1. Load business metadata (name, industry, services).
    2. Load customer memory from DB.
    3. Run RAG search over business knowledge base.
    4. Set business_context for downstream nodes.
    """
    logger.info(f"🎙️ Receptionist | input: {state['user_input'][:80]}")
    db = _db(state)

    # ── Load business metadata ────────────────────────────────────────────────
    if db:
        biz = await _load_business_context(state["business_id"], db)
        state["business_name"] = biz["name"]
        state["business_industry"] = biz["industry"]
        state["business_services"] = biz["services"]
        state["business_description"] = biz["description"]
    else:
        state.setdefault("business_name", "the business")
        state.setdefault("business_industry", "general")
        state.setdefault("business_services", [])
        state.setdefault("business_description", "")

    # ── Load customer memory ──────────────────────────────────────────────────
    if db:
        try:
            from app.memory import load_customer_memory
            memory = await load_customer_memory(
                business_id=state["business_id"],
                phone=state["customer_phone"],
                db=db,
            )
            state["customer_memory"] = memory
            logger.info(
                f"🧠 Customer memory loaded | new={memory.get('is_new')} "
                f"name={memory.get('full_name')}"
            )
        except Exception as e:
            logger.error(f"Memory load failed: {e}")

    # ── RAG context ───────────────────────────────────────────────────────────
    if db:
        try:
            from app.tools.search_tools import search_knowledge
            rag_result = await search_knowledge(
                query=state["user_input"],
                business_id=state["business_id"],
                db=db,
                top_k=4,
            )
            state["business_context"] = rag_result["context"]
        except Exception as e:
            logger.error(f"RAG search failed: {e}")
            state["business_context"] = ""
    else:
        state["business_context"] = ""

    return state


async def intent_classifier_node(state: AgentState) -> AgentState:
    """
    Classify customer intent and extract entities using Gemini Flash.
    Fully dynamic — prompt is built from real business metadata.
    """
    llm = _llm(fast=True)

    mem = state.get("customer_memory", {})
    customer_context = ""
    if mem and not mem.get("is_new"):
        prefs = mem.get("preferences", {})
        customer_context = (
            f"Returning customer: {mem.get('full_name', 'Unknown')}. "
            f"Known preferences: {json.dumps(prefs)}"
        )

    # Dynamic prompt based on actual business type
    system = _build_intent_prompt(
        industry=state.get("business_industry", "general"),
        business_name=state.get("business_name", "the business"),
        services=state.get("business_services", []),
        business_description=state.get("business_description", ""),
    )

    # Append business RAG context and returning customer info
    if state.get("business_context"):
        system += f"\n\nBusiness knowledge context:\n{state['business_context'][:800]}"
    if customer_context:
        system += f"\n\n{customer_context}"

    history_str = json.dumps(state.get("conversation_history", [])[-6:], indent=2)
    prompt = f"Conversation history:\n{history_str}\n\nCustomer message: {state['user_input']}"

    try:
        resp = await llm.ainvoke([
            {"role": "system", "content": system},
            {"role": "human", "content": prompt},
        ])
        content = resp.content.strip()
        # Strip markdown code fences if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        result = json.loads(content)
        state["intent"] = result.get("intent", "support")
        state["entities"] = result.get("entities", {})
        state["escalate"] = result.get("requires_escalation", False)
        state["escalation_reason"] = result.get("escalation_reason") or ""

        # Merge known customer name into entities
        if not state["entities"].get("customer_name") and state.get("customer_memory", {}).get("full_name"):
            state["entities"]["customer_name"] = state["customer_memory"]["full_name"]

        logger.info(f"🧠 Intent={state['intent']} | Entities={state['entities']} | Escalate={state['escalate']}")

    except (json.JSONDecodeError, Exception) as e:
        logger.warning(f"Intent classification failed: {e} — defaulting to support")
        state["intent"] = "support"
        state["entities"] = {}

    return state


async def lead_agent_node(state: AgentState) -> AgentState:
    """
    Handles inquiry intent for ANY business type:
    1. Search knowledge base for relevant info
    2. Get or create customer
    3. Create lead in DB + CRM
    4. Send WhatsApp info to customer
    5. Notify team if high-urgency / hot lead
    """
    logger.info(f"📋 Lead Agent | industry={state.get('business_industry')} intent={state['intent']}")
    db = _db(state)
    tool_results: dict = {}
    entities = state.get("entities", {})
    t0 = time.monotonic()

    # ── 1. Search knowledge base ──────────────────────────────────────────────
    if db:
        try:
            from app.tools.search_tools import search_knowledge
            # Build a rich query from entities for any business type
            query_parts = [state["user_input"]]
            if entities.get("service_requested"):
                query_parts.append(entities["service_requested"])
            if entities.get("location"):
                query_parts.append(entities["location"])
            enriched_query = " ".join(query_parts)

            search_result = await search_knowledge(
                query=enriched_query,
                business_id=state["business_id"],
                db=db,
                top_k=5,
            )
            tool_results["knowledge"] = {
                "found": search_result["found"],
                "count": len(search_result["results"]),
                "context": search_result["context"][:600],
                "items": search_result["results"][:3],
            }
            if search_result["context"]:
                state["business_context"] = (
                    state.get("business_context", "") + "\n\n" + search_result["context"]
                )
            if state.get("agent_run_id"):
                latency = int((time.monotonic() - t0) * 1000)
                await _log_tool_call(
                    state["agent_run_id"], "search_knowledge",
                    {"query": enriched_query},
                    {"found": search_result["found"], "count": len(search_result["results"])},
                    "success", latency, db,
                )
        except Exception as e:
            logger.error(f"search_knowledge failed: {e}")
            tool_results["knowledge"] = {"found": False, "error": str(e)}

    # ── 2. Get/create customer ────────────────────────────────────────────────
    customer = None
    if db:
        try:
            from app.tools.crm_tools import get_or_create_customer
            customer = await get_or_create_customer(
                business_id=state["business_id"],
                phone=state["customer_phone"],
                db=db,
                full_name=entities.get("customer_name"),
            )
        except Exception as e:
            logger.error(f"get_or_create_customer failed: {e}")

    # ── 3. Create lead ────────────────────────────────────────────────────────
    if db and customer:
        try:
            from app.tools.crm_tools import create_lead
            t1 = time.monotonic()
            lead_result = await create_lead(
                business_id=state["business_id"],
                customer=customer,
                entities=entities,
                db=db,
                business_industry=state.get("business_industry", "general"),
            )
            tool_results["lead"] = lead_result
            if state.get("agent_run_id"):
                await _log_tool_call(
                    state["agent_run_id"], "create_lead",
                    {"business_id": state["business_id"], "entities": entities},
                    lead_result, "success",
                    int((time.monotonic() - t1) * 1000), db,
                )
        except Exception as e:
            logger.error(f"create_lead failed: {e}")
            tool_results["lead"] = {"status": "error", "detail": str(e)}

    # ── 4. Send WhatsApp info to customer ─────────────────────────────────────
    if customer:
        try:
            from app.tools.communication_tools import send_inquiry_whatsapp
            knowledge_items = tool_results.get("knowledge", {}).get("items", [])
            wa_result = await send_inquiry_whatsapp(
                customer=customer,
                items=knowledge_items,
                business_name=state.get("business_name", ""),
                industry=state.get("business_industry", "general"),
            )
            tool_results["whatsapp"] = wa_result
        except Exception as e:
            logger.error(f"WhatsApp send failed: {e}")
            tool_results["whatsapp"] = {"status": "error"}

    # ── 5. Team alert for hot/urgent leads ────────────────────────────────────
    lead_score = tool_results.get("lead", {}).get("score", "")
    urgency = entities.get("urgency", "normal")
    if customer and (lead_score == "hot" or urgency == "high"):
        try:
            # Pull team phone from: business.settings.team_phone → env fallback
            if db:
                biz_ctx = await _load_business_context(state["business_id"], db)
                team_phone = biz_ctx.get("team_phone") or settings.TEAM_WHATSAPP_PHONE or ""
            else:
                team_phone = settings.TEAM_WHATSAPP_PHONE or ""

            if team_phone:
                from app.tools.communication_tools import notify_team_new_lead
                from app.models.customer import Lead
                from sqlalchemy import select as sa_select
                lead_id = tool_results.get("lead", {}).get("lead_id")
                lead_obj = None
                if lead_id and db:
                    r = await db.execute(
                        sa_select(Lead).where(Lead.id == uuid.UUID(lead_id))
                    )
                    lead_obj = r.scalar_one_or_none()

                await notify_team_new_lead(
                    team_phone=team_phone,
                    customer=customer,
                    lead=lead_obj,
                    entities=entities,
                    business_name=state.get("business_name", ""),
                    industry=state.get("business_industry", "general"),
                )
                logger.info(f"🔔 Team alert sent to {team_phone}")
        except Exception as e:
            logger.error(f"Team alert failed: {e}")

    # ── Update customer preferences ───────────────────────────────────────────
    if db and customer and entities:
        try:
            from app.memory import update_customer_preferences
            await update_customer_preferences(customer, entities, db)
        except Exception as e:
            logger.error(f"Preference update failed: {e}")

    state["tool_results"] = {**state.get("tool_results", {}), **tool_results}
    return state


async def booking_agent_node(state: AgentState) -> AgentState:
    """
    Handles appointment_request for ANY business type:
    1. Get available calendar slots
    2. Create appointment (Calendar + DB)
    3. Update CRM lead stage
    4. Send WhatsApp confirmation
    """
    logger.info(f"📅 Booking Agent | entities={state.get('entities')}")
    db = _db(state)
    tool_results: dict = {}
    entities = state.get("entities", {})

    # ── 1. Get/create customer ────────────────────────────────────────────────
    customer = None
    if db:
        try:
            from app.tools.crm_tools import get_or_create_customer
            customer = await get_or_create_customer(
                business_id=state["business_id"],
                phone=state["customer_phone"],
                db=db,
                full_name=entities.get("customer_name"),
            )
        except Exception as e:
            logger.error(f"get_or_create_customer failed: {e}")

    # ── 2. Check calendar availability ───────────────────────────────────────
    try:
        from app.tools.calendar_tools import get_available_slots
        t0 = time.monotonic()
        slots_result = await get_available_slots(
            business_id=state["business_id"],
            preferred_datetime=entities.get("preferred_datetime"),
        )
        tool_results["calendar_slots"] = slots_result
        if state.get("agent_run_id") and db:
            await _log_tool_call(
                state["agent_run_id"], "get_available_slots",
                {"preferred_datetime": entities.get("preferred_datetime")},
                slots_result, "success", int((time.monotonic() - t0) * 1000), db,
            )
    except Exception as e:
        logger.error(f"get_available_slots failed: {e}")
        tool_results["calendar_slots"] = {"slots": [], "error": str(e)}

    # ── 3. Book the best available slot ──────────────────────────────────────
    slots = tool_results.get("calendar_slots", {}).get("slots", [])
    if slots and customer:
        try:
            from app.tools.calendar_tools import create_appointment
            t1 = time.monotonic()
            best_slot = slots[0]
            customer_name = customer.full_name or customer.phone
            service = entities.get("service_requested") or state.get("business_industry", "Service")
            appt_result = await create_appointment(
                business_id=state["business_id"],
                customer=customer,
                slot_start=best_slot["start"],
                title=f"{service.title()} — {customer_name}",
                duration_minutes=60,
                description=(
                    f"Service: {service}\n"
                    f"Customer requirements: {json.dumps(entities)}\n"
                    f"Conversation: {state['user_input'][:200]}"
                ),
                db=db,
            )
            tool_results["appointment"] = appt_result
            if state.get("agent_run_id") and db:
                await _log_tool_call(
                    state["agent_run_id"], "create_appointment",
                    {"slot": best_slot["start"], "customer": customer_name, "service": service},
                    appt_result, "success", int((time.monotonic() - t1) * 1000), db,
                )
        except Exception as e:
            logger.error(f"create_appointment failed: {e}")
            tool_results["appointment"] = {"status": "error", "detail": str(e)}

    # ── 4. Update CRM lead stage → qualified ─────────────────────────────────
    if db:
        try:
            from app.tools.crm_tools import create_lead, update_lead_stage
            lead_result = await create_lead(
                business_id=state["business_id"],
                customer=customer,
                entities=entities,
                db=db,
                business_industry=state.get("business_industry", "general"),
            )
            tool_results["lead"] = lead_result
            if lead_result.get("lead_id"):
                await update_lead_stage(
                    business_id=state["business_id"],
                    lead_id=lead_result["lead_id"],
                    stage="qualified",
                    note=f"Appointment booked for {tool_results.get('appointment', {}).get('start_label')}",
                    db=db,
                )
        except Exception as e:
            logger.error(f"CRM stage update failed: {e}")

    # ── 5. Send WhatsApp confirmation ─────────────────────────────────────────
    if customer and tool_results.get("appointment", {}).get("status") == "confirmed":
        try:
            from app.tools.communication_tools import send_appointment_confirmation
            appt = tool_results["appointment"]
            wa_result = await send_appointment_confirmation(
                customer=customer,
                appointment={
                    "date": appt.get("start_label", "").split(",")[1].strip()
                    if "," in appt.get("start_label", "") else appt.get("start_label", ""),
                    "time": appt.get("start_label", "").split(",")[0].strip()
                    if "," in appt.get("start_label", "") else appt.get("start_label", ""),
                    "location": "Our office (we'll send details)",
                    "meet_link": appt.get("meet_link"),
                    "service": entities.get("service_requested", ""),
                    "business_name": state.get("business_name", ""),
                },
            )
            tool_results["whatsapp"] = wa_result
        except Exception as e:
            logger.error(f"WhatsApp confirmation failed: {e}")

    state["tool_results"] = {**state.get("tool_results", {}), **tool_results}
    return state


async def support_agent_node(state: AgentState) -> AgentState:
    """
    Handles support / complaint / follow_up / out_of_scope for any business:
    Searches the knowledge base for answers (FAQs, policies, pricing).
    """
    logger.info(f"🛠️ Support Agent | intent={state['intent']}")
    db = _db(state)
    tool_results: dict = {}

    if db:
        try:
            from app.tools.search_tools import search_knowledge
            rag_result = await search_knowledge(
                query=state["user_input"],
                business_id=state["business_id"],
                db=db,
                top_k=5,
            )
            tool_results["knowledge"] = {
                "found": rag_result["found"],
                "context": rag_result["context"][:800],
            }
            if rag_result["context"]:
                state["business_context"] = (
                    state.get("business_context", "") + "\n\n" + rag_result["context"]
                )
            if state.get("agent_run_id"):
                await _log_tool_call(
                    state["agent_run_id"], "search_knowledge",
                    {"query": state["user_input"]},
                    {"found": rag_result["found"]}, "success", 0, db,
                )
        except Exception as e:
            logger.error(f"Knowledge search failed: {e}")
            tool_results["knowledge"] = {"found": False, "error": str(e)}

    state["tool_results"] = {**state.get("tool_results", {}), **tool_results}
    return state


async def responder_node(state: AgentState) -> AgentState:
    """
    Generate the final spoken/text response to the customer.
    Uses full context: intent, entities, tool results, business context.
    Fully industry-agnostic.
    """
    llm = _llm(fast=True)

    mem = state.get("customer_memory", {})
    customer_name = (
        state.get("entities", {}).get("customer_name")
        or mem.get("full_name")
        or "there"
    )

    # Summarise what actions were taken (generic for any business)
    actions_summary = []
    tr = state.get("tool_results", {})
    if tr.get("lead", {}).get("status") == "created":
        actions_summary.append(f"Inquiry logged (score: {tr['lead'].get('score', '?')})")
    if tr.get("appointment", {}).get("status") == "confirmed":
        actions_summary.append(f"Appointment booked for {tr['appointment'].get('start_label', '?')}")
    if tr.get("whatsapp", {}).get("status") == "sent":
        actions_summary.append("WhatsApp message sent to customer")
    if tr.get("knowledge", {}).get("found"):
        actions_summary.append("Found relevant information from knowledge base")

    system = _build_responder_prompt(
        industry=state.get("business_industry", "general"),
        business_name=state.get("business_name", "the business"),
    )

    prompt = f"""Customer name: {customer_name}
Customer said: "{state['user_input']}"
Intent: {state['intent']}
Entities extracted: {json.dumps(state.get('entities', {}), indent=2)}
Actions taken: {', '.join(actions_summary) if actions_summary else 'None yet'}
Business context available: {state.get('business_context', '')[:500]}

Generate a natural, conversational response (max 3 sentences for voice):"""

    try:
        resp = await llm.ainvoke([
            {"role": "system", "content": system},
            {"role": "human", "content": prompt},
        ])
        state["response"] = resp.content.strip()
    except Exception as e:
        logger.error(f"Responder LLM failed: {e}")
        state["response"] = (
            "Thank you for your enquiry. Our team will follow up with you shortly. "
            "Have a great day!"
        )

    state["next_action"] = "continue"
    logger.info(f"💬 Response: {state['response'][:120]}")
    return state


async def human_handoff_node(state: AgentState) -> AgentState:
    """
    Escalation node:
    1. Creates HumanHandoff DB record
    2. Notifies team via WhatsApp (using business.settings.team_phone)
    3. Responds to customer with hold message
    """
    logger.warning(f"🚨 Human handoff | reason: {state.get('escalation_reason')}")
    db = _db(state)

    # ── Get customer ──────────────────────────────────────────────────────────
    customer = None
    if db:
        try:
            from app.tools.crm_tools import get_or_create_customer
            customer = await get_or_create_customer(
                business_id=state["business_id"],
                phone=state["customer_phone"],
                db=db,
            )
        except Exception as e:
            logger.error(f"get_or_create_customer in handoff: {e}")

    # ── Summarise conversation for human context ───────────────────────────────
    history = state.get("conversation_history", [])
    summary_lines = [f"{m['role'].upper()}: {m['content']}" for m in history[-6:]]
    summary_lines.append(f"CUSTOMER: {state['user_input']}")
    conversation_summary = "\n".join(summary_lines)

    # ── Persist HumanHandoff ──────────────────────────────────────────────────
    if db:
        try:
            from app.models.integration import HumanHandoff
            handoff = HumanHandoff(
                business_id=uuid.UUID(state["business_id"]),
                conversation_id=uuid.UUID(state["conversation_id"]),
                trigger_reason=state.get("escalation_reason") or "requested",
                context_summary=conversation_summary,
                customer_intent=state.get("intent"),
                recommended_action="Call customer immediately",
            )
            db.add(handoff)
            await db.flush()
            logger.info(f"📋 HumanHandoff created: {handoff.id}")
        except Exception as e:
            logger.error(f"HumanHandoff creation failed: {e}")

    # ── Notify team — pull phone from business settings first ─────────────────
    team_phone = ""
    if db:
        try:
            biz_ctx = await _load_business_context(state["business_id"], db)
            team_phone = biz_ctx.get("team_phone", "")
        except Exception:
            pass
    if not team_phone:
        team_phone = (settings.TEAM_WHATSAPP_PHONE or settings.TWILIO_WHATSAPP_NUMBER).strip()

    if customer and team_phone:
        try:
            from app.tools.communication_tools import notify_human_handoff
            await notify_human_handoff(
                team_phone=team_phone,
                customer=customer,
                reason=state.get("escalation_reason") or "Customer requested human",
                conversation_summary=conversation_summary,
                entities=state.get("entities", {}),
                business_name=state.get("business_name", ""),
                industry=state.get("business_industry", "general"),
            )
        except Exception as e:
            logger.error(f"Team handoff notification failed: {e}")

    state["response"] = (
        "I completely understand. Let me connect you with one of our team members "
        "right now — they have your full conversation details and will be with you "
        "in just a moment. Thank you for your patience."
    )
    state["next_action"] = "human_handoff"
    return state


# ── Routing ───────────────────────────────────────────────────────────────────

def route_by_intent(
    state: AgentState,
) -> Literal["lead_agent", "booking_agent", "support_agent", "human_handoff"]:
    if state.get("escalate"):
        return "human_handoff"
    intent = state.get("intent", "support")
    if intent == "inquiry":
        return "lead_agent"
    elif intent == "appointment_request":
        return "booking_agent"
    elif intent in ("complaint",):
        # Complaints can escalate or go to support depending on severity
        if state.get("escalate"):
            return "human_handoff"
        return "support_agent"
    else:
        # support, follow_up, out_of_scope, unknown
        return "support_agent"


# ── Build Graph ───────────────────────────────────────────────────────────────

def build_agent_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    graph.add_node("receptionist", receptionist_node)
    graph.add_node("intent_classifier", intent_classifier_node)
    graph.add_node("lead_agent", lead_agent_node)
    graph.add_node("booking_agent", booking_agent_node)
    graph.add_node("support_agent", support_agent_node)
    graph.add_node("responder", responder_node)
    graph.add_node("human_handoff", human_handoff_node)

    graph.set_entry_point("receptionist")
    graph.add_edge("receptionist", "intent_classifier")
    graph.add_conditional_edges(
        "intent_classifier",
        route_by_intent,
        {
            "lead_agent": "lead_agent",
            "booking_agent": "booking_agent",
            "support_agent": "support_agent",
            "human_handoff": "human_handoff",
        },
    )
    graph.add_edge("lead_agent", "responder")
    graph.add_edge("booking_agent", "responder")
    graph.add_edge("support_agent", "responder")
    graph.add_edge("responder", END)
    graph.add_edge("human_handoff", END)

    return graph.compile()


# ── Singleton ─────────────────────────────────────────────────────────────────

agent_graph = build_agent_graph()


# ── Public entry point ────────────────────────────────────────────────────────

async def process_customer_input(
    user_input: str,
    conversation_id: str,
    business_id: str,
    customer_phone: str,
    conversation_history: list[dict] | None = None,
    customer_memory: dict | None = None,
    db: AsyncSession | None = None,
    agent_id: str | None = None,
) -> dict:
    """
    Main entry point — called from the Twilio webhook handler.

    Creates an AgentRun record, runs the graph, finalises the record.
    Returns the agent's response and metadata.
    """
    t_start = time.monotonic()

    # ── Create AgentRun record ────────────────────────────────────────────────
    agent_run_id: str | None = None
    if db and agent_id:
        try:
            from app.models.conversation import AgentRun
            run = AgentRun(
                agent_id=uuid.UUID(agent_id),
                conversation_id=uuid.UUID(conversation_id),
                input_text=user_input,
                status="running",
            )
            db.add(run)
            await db.flush()
            agent_run_id = str(run.id)
        except Exception as e:
            logger.error(f"AgentRun creation failed: {e}")

    # ── Build initial state ───────────────────────────────────────────────────
    initial_state: AgentState = {
        "conversation_id": conversation_id,
        "business_id": business_id,
        "customer_phone": customer_phone,
        "agent_run_id": agent_run_id,
        "user_input": user_input,
        "conversation_history": conversation_history or [],
        "customer_memory": customer_memory or {},
        "business_name": "",
        "business_industry": "general",
        "business_services": [],
        "business_description": "",
        "business_context": "",
        "intent": "",
        "entities": {},
        "plan": [],
        "tool_results": {},
        "response": "",
        "escalate": False,
        "escalation_reason": "",
        "next_action": "continue",
        "_db": db,
    }

    # ── Run graph ─────────────────────────────────────────────────────────────
    result = await agent_graph.ainvoke(initial_state)

    latency_ms = int((time.monotonic() - t_start) * 1000)
    logger.info(f"⚡ Agent graph completed in {latency_ms}ms")

    # ── Finalise AgentRun ─────────────────────────────────────────────────────
    if db and agent_run_id:
        try:
            from sqlalchemy import select
            from app.models.conversation import AgentRun
            r = await db.execute(
                select(AgentRun).where(AgentRun.id == uuid.UUID(agent_run_id))
            )
            run = r.scalar_one_or_none()
            if run:
                run.status = "completed" if not result.get("escalate") else "escalated"
                run.intent = result.get("intent")
                run.output_text = result.get("response")
                run.latency_ms = latency_ms
                run.completed_at = datetime.now(timezone.utc)
                await db.flush()
        except Exception as e:
            logger.error(f"AgentRun finalise failed: {e}")

    return {
        "response": result["response"],
        "intent": result["intent"],
        "entities": result["entities"],
        "next_action": result["next_action"],
        "tool_results": result["tool_results"],
        "agent_run_id": agent_run_id,
        "latency_ms": latency_ms,
    }
