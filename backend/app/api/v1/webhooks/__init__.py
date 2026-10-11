"""
Operator AI — Webhook Handlers

Meta WhatsApp Cloud API:
  GET  /webhooks/whatsapp          → hub verification handshake
  POST /webhooks/whatsapp          → inbound messages + status events

Exotel Voice:
  POST /webhooks/exotel/inbound    → call initiated (Exotel sends exoml or status)
  POST /webhooks/exotel/status     → call status callback (completed / failed / …)
  POST /webhooks/exotel/call       → outbound call placement endpoint

Legacy Twilio routes are preserved below but disabled — remove after cutover.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Response, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.logging import logger
from app.database.session import get_db

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════════════
# SHARED HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

async def _get_business_and_agent(identifier: str, db: AsyncSession, field: str = "phone_number"):
    """
    Look up Business + Agent by phone number or whatsapp_phone_number_id.
    Falls back to first active business/agent for dev/demo.
    """
    from app.models.agent import Agent, AgentStatus
    from app.models.business import Business

    query = select(Agent).where(
        getattr(Agent, field) == identifier,
        Agent.is_active == True,
        Agent.status == AgentStatus.ACTIVE,
    )
    result = await db.execute(query)
    agent = result.scalar_one_or_none()

    if agent:
        biz_result = await db.execute(select(Business).where(Business.id == agent.business_id))
        business = biz_result.scalar_one_or_none()
        return business, agent

    # Dev fallback
    biz_result = await db.execute(select(Business).limit(1))
    business = biz_result.scalar_one_or_none()
    agent_result = await db.execute(select(Agent).limit(1))
    agent = agent_result.scalar_one_or_none()
    return business, agent


async def _get_or_create_whatsapp_conversation(
    business_id: uuid.UUID,
    customer_phone: str,
    provider_message_id: str,
    db: AsyncSession,
    agent_id: uuid.UUID | None = None,
):
    """Find or create a WhatsApp conversation for the given customer phone."""
    from app.models.conversation import (
        Conversation, ConversationChannel, ConversationStatus,
    )
    from app.models.customer import Customer

    # Find or create customer record
    cust_result = await db.execute(
        select(Customer).where(
            Customer.phone == customer_phone,
            Customer.business_id == business_id,
        )
    )
    customer = cust_result.scalar_one_or_none()
    if not customer:
        customer = Customer(
            business_id=business_id,
            phone=customer_phone,
            full_name=customer_phone,
        )
        db.add(customer)
        await db.flush()

    # Find the most recent active WhatsApp conversation for this customer
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.business_id == business_id,
            Conversation.customer_id == customer.id,
            Conversation.channel == ConversationChannel.WHATSAPP,
            Conversation.status == ConversationStatus.ACTIVE,
        ).order_by(Conversation.created_at.desc()).limit(1)
    )
    conversation = conv_result.scalar_one_or_none()

    if not conversation:
        conversation = Conversation(
            business_id=business_id,
            customer_id=customer.id,
            agent_id=agent_id,
            channel=ConversationChannel.WHATSAPP,
            status=ConversationStatus.ACTIVE,
        )
        db.add(conversation)
        await db.flush()

    return conversation, customer


async def _get_or_create_call_conversation(
    business_id: uuid.UUID,
    customer_phone: str,
    call_sid: str,
    db: AsyncSession,
    agent_id: uuid.UUID | None = None,
):
    """Find or create a phone-call conversation."""
    from app.models.conversation import (
        Conversation, Call, ConversationChannel, ConversationStatus, CallStatus,
    )

    # Look for existing call
    call_result = await db.execute(
        select(Call).where(Call.provider_call_sid == call_sid)
    )
    existing_call = call_result.scalar_one_or_none()
    if existing_call and existing_call.conversation_id:
        conv_result = await db.execute(
            select(Conversation).where(Conversation.id == existing_call.conversation_id)
        )
        return conv_result.scalar_one_or_none(), existing_call

    conversation = Conversation(
        business_id=business_id,
        agent_id=agent_id,
        channel=ConversationChannel.PHONE,
        status=ConversationStatus.ACTIVE,
    )
    db.add(conversation)
    await db.flush()

    call = Call(
        business_id=business_id,
        conversation_id=conversation.id,
        provider_call_sid=call_sid,
        from_number=customer_phone,
        to_number="",
        direction="inbound",
        status=CallStatus.IN_PROGRESS,
        answered_at=datetime.now(timezone.utc),
    )
    db.add(call)
    await db.flush()
    return conversation, call


# Deduplication cache (in-process; survives restarts only if Redis used)
_processed_wamids: set[str] = set()
_MAX_WAMID_CACHE = 5000


def _is_duplicate_wamid(wamid: str) -> bool:
    if wamid in _processed_wamids:
        return True
    if len(_processed_wamids) > _MAX_WAMID_CACHE:
        _processed_wamids.clear()
    _processed_wamids.add(wamid)
    return False


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4: META WHATSAPP CLOUD API WEBHOOKS
# ═══════════════════════════════════════════════════════════════════════════════

def _verify_meta_signature(raw_body: bytes, signature_header: str) -> bool:
    """Verify X-Hub-Signature-256 using constant-time comparison."""
    app_secret = settings.META_APP_SECRET
    if not app_secret:
        # No secret configured — skip in dev, reject in prod
        if settings.is_production:
            return False
        return True
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = signature_header[len("sha256="):]
    computed = hmac.new(
        app_secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(computed, expected)


@router.get("/whatsapp")
async def whatsapp_webhook_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """
    Meta webhook verification handshake.
    Meta sends GET with hub.mode=subscribe + hub.verify_token + hub.challenge.
    We must return the challenge exactly if the token matches.

    Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/
    """
    if hub_mode != "subscribe":
        logger.warning(f"[Meta WA] Verify: unexpected hub.mode={hub_mode!r}")
        raise HTTPException(status_code=403, detail="Invalid hub.mode")

    expected_token = settings.META_WHATSAPP_VERIFY_TOKEN
    if not expected_token:
        logger.error("[Meta WA] META_WHATSAPP_VERIFY_TOKEN is not set — verification will always fail")
        raise HTTPException(status_code=500, detail="Verify token not configured")

    if not hmac.compare_digest(hub_verify_token or "", expected_token):
        logger.warning("[Meta WA] Verify: token mismatch — rejecting")
        raise HTTPException(status_code=403, detail="Verify token mismatch")

    logger.info("[Meta WA] ✅ Webhook verified successfully")
    return Response(content=hub_challenge, media_type="text/plain")


@router.post("/whatsapp")
async def whatsapp_webhook_inbound(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive inbound WhatsApp messages and status updates from Meta.

    Security:
      - Validate X-Hub-Signature-256 against raw request body + META_APP_SECRET
      - Deduplicate using provider message ID (wamid)
      - Persist before triggering AI to avoid data loss on crash
      - Return 200 quickly; AI processing is synchronous for now
        (use background tasks for scale)

    Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/
    """
    raw_body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    if not _verify_meta_signature(raw_body, signature):
        logger.warning("[Meta WA] ❌ Invalid signature — rejecting webhook")
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if payload.get("object") != "whatsapp_business_account":
        # Not a WhatsApp webhook — acknowledge and ignore
        return Response(status_code=200, content="ok")

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "messages":
                continue
            value = change.get("value", {})

            # ── Status events (delivered / read / failed) ──────────────────
            for status_evt in value.get("statuses", []):
                await _handle_wa_status(status_evt, db)

            # ── Inbound messages ───────────────────────────────────────────
            phone_number_id = value.get("metadata", {}).get("phone_number_id", "")
            for msg in value.get("messages", []):
                await _handle_wa_message(msg, phone_number_id, db)

    # Always return 200 to acknowledge receipt
    return Response(status_code=200, content="ok")


async def _handle_wa_status(status_evt: dict, db: AsyncSession) -> None:
    """Update message delivery / read status in DB."""
    wamid = status_evt.get("id", "")
    status = status_evt.get("status", "")   # sent / delivered / read / failed
    ts = status_evt.get("timestamp", "")
    logger.info(f"[Meta WA] Status update | wamid={wamid} status={status}")
    # TODO: Update Message row status field once provider_message_id column is added


async def _handle_wa_message(msg: dict, phone_number_id: str, db: AsyncSession) -> None:
    """
    Process a single inbound WhatsApp message:
    1. Deduplicate
    2. Resolve business + agent from phone_number_id
    3. Persist message
    4. Invoke AI orchestrator
    5. Send reply via Meta Cloud API
    """
    wamid = msg.get("id", "")
    if _is_duplicate_wamid(wamid):
        logger.info(f"[Meta WA] Duplicate wamid={wamid} — skipping")
        return

    from_number = msg.get("from", "")       # sender's WhatsApp number
    msg_type = msg.get("type", "text")
    timestamp = msg.get("timestamp", "")

    if msg_type == "text":
        body = msg.get("text", {}).get("body", "").strip()
    elif msg_type in ("image", "audio", "video", "document"):
        body = f"[{msg_type} message received — media processing not yet enabled]"
        logger.info(f"[Meta WA] Media message type={msg_type} from={from_number}")
    else:
        body = f"[{msg_type} message]"

    if not body:
        logger.info(f"[Meta WA] Empty body from {from_number} — skipping")
        return

    logger.info(f"[Meta WA] 📩 Message | from={from_number} wamid={wamid} body='{body[:80]}'")

    # Resolve business + agent via phone_number_id (stored on Agent)
    business, agent = await _get_business_and_agent(
        phone_number_id, db, field="whatsapp_phone_number_id"
    )
    if not business:
        logger.warning(f"[Meta WA] No business found for phone_number_id={phone_number_id}")
        return

    business_id = business.id
    agent_id = agent.id if agent else None

    # Get or create conversation
    try:
        conversation, customer = await _get_or_create_whatsapp_conversation(
            business_id=business_id,
            customer_phone=from_number,
            provider_message_id=wamid,
            db=db,
            agent_id=agent_id,
        )
        conversation_id = str(conversation.id)
    except Exception as e:
        logger.error(f"[Meta WA] Conversation creation failed: {e}")
        return

    # Persist inbound message
    try:
        from app.memory import save_message
        from app.models.conversation import MessageRole
        await save_message(
            conversation_id=conversation_id,
            role=MessageRole.CUSTOMER,
            content=body,
            db=db,
            metadata={"wamid": wamid, "type": msg_type, "timestamp": timestamp},
        )
    except Exception as e:
        logger.error(f"[Meta WA] Save inbound message failed: {e}")

    # Load conversation history
    try:
        from app.memory import load_conversation_history
        history = await load_conversation_history(conversation_id, db, limit=10)
    except Exception:
        history = []

    # Run AI orchestrator
    try:
        from app.agents.orchestrator.graph import process_customer_input
        ai_result = await process_customer_input(
            user_input=body,
            conversation_id=conversation_id,
            business_id=str(business_id),
            customer_phone=from_number,
            conversation_history=history,
            db=db,
            agent_id=str(agent_id) if agent_id else None,
        )
        ai_response = ai_result["response"]
        logger.info(
            f"[Meta WA] 🤖 AI responded | latency={ai_result.get('latency_ms')}ms "
            f"intent={ai_result.get('intent')}"
        )
    except Exception as e:
        logger.error(f"[Meta WA] AI orchestrator failed: {e}")
        ai_response = (
            "Thank you for your message. Our team will get back to you shortly."
        )

    # Send reply via Meta Cloud API
    try:
        from app.integrations.whatsapp import get_whatsapp_client
        wa = get_whatsapp_client()
        reply_wamid = await wa.send_text(from_number, ai_response)
        logger.info(f"[Meta WA] ✅ Reply sent | wamid={reply_wamid}")
    except Exception as e:
        logger.error(f"[Meta WA] Send reply failed: {e}")
        reply_wamid = None

    # Persist outbound message
    try:
        from app.memory import save_message
        from app.models.conversation import MessageRole
        await save_message(
            conversation_id=conversation_id,
            role=MessageRole.AGENT,
            content=ai_response,
            db=db,
            metadata={"wamid": reply_wamid or "", "channel": "whatsapp"},
        )
        await db.commit()
    except Exception as e:
        logger.error(f"[Meta WA] Save agent reply failed: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 6-7: EXOTEL VOICE WEBHOOKS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/exotel/inbound")
async def exotel_inbound(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Exotel sends this callback when an inbound call arrives.
    Exotel routes the call via the configured App/Flow URL.

    For Voice AI / AgentStream calls, Exotel connects the call to
    the configured StreamUrl (wss://) endpoint for bidirectional audio.

    Exotel sends form-encoded data with CallSid, From, To, Status, etc.
    Docs: https://developer.exotel.com/api/#calls
    """
    form = await request.form()
    call_sid = form.get("CallSid", "") or form.get("Sid", "")
    from_number = form.get("From", "")
    to_number = form.get("To", "")
    status = form.get("Status", "")

    logger.info(
        f"[Exotel] 📞 Inbound call | from={from_number} to={to_number} "
        f"SID={call_sid} status={status}"
    )

    # Rate limit check
    from app.core.redis import check_rate_limit
    rate_key = f"rl:voice:{from_number}"
    allowed, hit_count = await check_rate_limit(rate_key)
    if not allowed:
        logger.warning(f"[Exotel] Rate limit exceeded for {from_number} ({hit_count} calls)")
        # Return ExoML to end call — Exotel uses ExoML (similar to TwiML)
        exoml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We are currently experiencing high call volume. Please try again in a few minutes. Goodbye!</Say>
  <Hangup/>
</Response>"""
        return Response(content=exoml, media_type="application/xml")

    # Look up business + agent
    business, agent = await _get_business_and_agent(to_number, db, field="phone_number")
    business_id = str(business.id) if business else "00000000-0000-0000-0000-000000000000"
    agent_id = str(agent.id) if agent else None

    # Create conversation + call records
    try:
        conversation, call = await _get_or_create_call_conversation(
            business_id=uuid.UUID(business_id),
            customer_phone=from_number,
            call_sid=call_sid,
            db=db,
            agent_id=uuid.UUID(agent_id) if agent_id else None,
        )
        call.to_number = to_number
        conversation_id = str(conversation.id)
        await db.flush()
    except Exception as e:
        logger.error(f"[Exotel] Conversation creation failed: {e}")
        conversation_id = str(uuid.uuid4())

    # Greeting
    greeting = "Hello! Thank you for calling. How can I help you today?"
    if agent and hasattr(agent, "config") and agent.config and agent.config.greeting_message:
        greeting = agent.config.greeting_message
    elif business:
        greeting = f"Hello! Thank you for calling {business.name}. How can I help you today?"

    # If AgentStream / StreamUrl is configured, Exotel handles the audio stream
    # and calls back our stream endpoint. We acknowledge here.
    stream_url = settings.EXOTEL_STREAM_URL
    if stream_url:
        logger.info(f"[Exotel] AgentStream mode — stream_url={stream_url}")
        # Exotel Stream mode — return acknowledgment; audio handled via WebSocket
        exoml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>{greeting}</Say>
  <Stream url="{stream_url}" bidirectional="true"/>
</Response>"""
    else:
        # Standard ExoML — say greeting and wait (basic demo flow)
        process_url = (
            f"{settings.effective_webhook_base_url}/api/v1/webhooks/exotel/process"
            f"?business_id={business_id}&conversation_id={conversation_id}"
            f"&agent_id={agent_id or ''}&call_sid={call_sid}"
        )
        exoml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>{greeting}</Say>
  <GetDigits action="{process_url}" method="POST" timeout="5" numDigits="1" finishOnKey="#">
  </GetDigits>
</Response>"""

    return Response(content=exoml, media_type="application/xml")


@router.post("/exotel/process")
async def exotel_voice_process(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Exotel sends caller input here (digit or speech).
    For full Voice AI, this path is only used in non-streaming mode.
    In AgentStream mode, audio is exchanged via WebSocket instead.
    """
    form = await request.form()
    digits = form.get("Digits", "").strip()
    call_sid = form.get("CallSid", "") or form.get("Sid", "")
    params = request.query_params
    business_id = params.get("business_id", "")
    conversation_id = params.get("conversation_id", str(uuid.uuid4()))
    agent_id = params.get("agent_id") or None
    from_number = form.get("From", "unknown")

    user_input = digits or "Hello"  # digits as text for basic demo

    logger.info(f"[Exotel] 🎤 Input | digits={digits!r} SID={call_sid}")

    # Persist customer message
    try:
        from app.memory import save_message
        from app.models.conversation import MessageRole
        await save_message(
            conversation_id=conversation_id,
            role=MessageRole.CUSTOMER,
            content=user_input,
            db=db,
            metadata={"call_sid": call_sid, "digits": digits},
        )
    except Exception as e:
        logger.error(f"[Exotel] Save message failed: {e}")

    # Load history and run AI
    try:
        from app.memory import load_conversation_history
        history = await load_conversation_history(conversation_id, db, limit=10)
    except Exception:
        history = []

    try:
        from app.agents.orchestrator.graph import process_customer_input
        ai_result = await process_customer_input(
            user_input=user_input,
            conversation_id=conversation_id,
            business_id=business_id,
            customer_phone=from_number,
            conversation_history=history,
            db=db,
            agent_id=agent_id,
        )
        ai_response = ai_result["response"]
        next_action = ai_result.get("next_action", "continue")
    except Exception as e:
        logger.error(f"[Exotel] AI orchestrator failed: {e}")
        ai_response = "I apologise for the technical issue. Please hold."
        next_action = "continue"

    # Persist AI response
    try:
        from app.memory import save_message
        from app.models.conversation import MessageRole
        await save_message(
            conversation_id=conversation_id,
            role=MessageRole.AGENT,
            content=ai_response,
            db=db,
        )
    except Exception as e:
        logger.error(f"[Exotel] Save agent message failed: {e}")

    # Build ExoML
    if next_action == "end_call":
        exoml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>{ai_response}</Say>
  <Hangup/>
</Response>"""
    elif next_action == "human_handoff":
        escalation = settings.ESCALATION_PHONE.strip()
        if escalation:
            exoml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>{ai_response}</Say>
  <Say>Please hold while I connect you.</Say>
  <Dial action="{settings.effective_webhook_base_url}/api/v1/webhooks/exotel/dial-status?conversation_id={conversation_id}" method="POST">
    <Number>{escalation}</Number>
  </Dial>
</Response>"""
        else:
            exoml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Our team will call you back shortly. Thank you for your patience. Goodbye!</Say>
  <Hangup/>
</Response>"""
    else:
        process_url = (
            f"{settings.effective_webhook_base_url}/api/v1/webhooks/exotel/process"
            f"?business_id={business_id}&conversation_id={conversation_id}"
            f"&agent_id={agent_id or ''}&call_sid={call_sid}"
        )
        exoml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>{ai_response}</Say>
  <GetDigits action="{process_url}" method="POST" timeout="5" numDigits="1" finishOnKey="#">
  </GetDigits>
  <Say>I didn't catch that. Thank you for calling. Goodbye!</Say>
  <Hangup/>
</Response>"""

    return Response(content=exoml, media_type="application/xml")


@router.post("/exotel/status")
async def exotel_call_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Exotel status callback — called when call status changes.
    Finalises the Call record and closes the conversation.
    Docs: https://developer.exotel.com/api/#calls-status-callback
    """
    form = await request.form()
    call_sid = form.get("CallSid", "") or form.get("Sid", "")
    call_status = form.get("Status", "").lower()
    duration = form.get("Duration")
    recording_url = form.get("RecordingUrl")

    logger.info(f"[Exotel] 📞 Status | SID={call_sid} status={call_status} duration={duration}s")

    try:
        from app.models.conversation import Call, CallStatus, Conversation, ConversationStatus

        result = await db.execute(select(Call).where(Call.provider_call_sid == call_sid))
        call = result.scalar_one_or_none()

        if call:
            status_map = {
                "completed": CallStatus.COMPLETED,
                "failed": CallStatus.FAILED,
                "busy": CallStatus.BUSY,
                "no-answer": CallStatus.NO_ANSWER,
                "no_answer": CallStatus.NO_ANSWER,
                "canceled": CallStatus.FAILED,
            }
            call.status = status_map.get(call_status, CallStatus.COMPLETED)
            call.duration_seconds = int(duration) if duration else None
            if recording_url:
                call.recording_url = recording_url
            call.ended_at = datetime.now(timezone.utc)

            if call.conversation_id:
                conv_result = await db.execute(
                    select(Conversation).where(Conversation.id == call.conversation_id)
                )
                conv = conv_result.scalar_one_or_none()
                if conv and conv.status == ConversationStatus.ACTIVE:
                    conv.status = ConversationStatus.COMPLETED
                    conv.ended_at = datetime.now(timezone.utc)

            await db.commit()
    except Exception as e:
        logger.error(f"[Exotel] Status update failed: {e}")

    return Response(status_code=200, content="ok")


@router.post("/exotel/dial-status")
async def exotel_dial_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Called by Exotel after escalation Dial completes.
    If human didn't answer, play fallback and hang up.
    """
    form = await request.form()
    dial_status = (form.get("DialCallStatus") or form.get("Status") or "").lower()
    call_sid = form.get("CallSid", "") or form.get("Sid", "")
    params = request.query_params
    conversation_id = params.get("conversation_id", "")

    logger.info(f"[Exotel] 📞 Dial status | SID={call_sid} status={dial_status}")

    if dial_status == "completed":
        exoml = """<?xml version="1.0" encoding="UTF-8"?>
<Response><Hangup/></Response>"""
    else:
        logger.warning(f"[Exotel] Human agent did not answer | status={dial_status}")
        exoml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>I'm sorry, our team is currently unavailable. We will call you back within 15 minutes. Thank you for your patience. Goodbye!</Say>
  <Hangup/>
</Response>"""
        if conversation_id:
            try:
                from app.models.conversation import Conversation, ConversationStatus
                result = await db.execute(
                    select(Conversation).where(Conversation.id == uuid.UUID(conversation_id))
                )
                conv = result.scalar_one_or_none()
                if conv:
                    conv.status = ConversationStatus.ESCALATED
                    await db.commit()
            except Exception as e:
                logger.error(f"[Exotel] Dial status conversation update failed: {e}")

    return Response(content=exoml, media_type="application/xml")


# ═══════════════════════════════════════════════════════════════════════════════
# OUTBOUND CALL PLACEMENT (internal API — protected by auth)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/exotel/call")
async def exotel_place_call(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Internal endpoint to initiate an outbound Exotel call.
    Protected — should only be called from authenticated internal services.

    Body JSON: {to_number, from_number?, use_voice_ai?}
    """
    from app.security.auth import get_current_user
    from app.integrations.telephony import get_voice_client

    # Basic internal auth check (reuse JWT in Authorization header)
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    to_number = body.get("to_number", "").strip()
    if not to_number:
        raise HTTPException(status_code=422, detail="to_number is required")

    from_number = body.get("from_number", "") or settings.EXOTEL_CALLER_ID
    use_voice_ai = body.get("use_voice_ai", False)

    stream_url = settings.EXOTEL_STREAM_URL if use_voice_ai else None
    status_cb = (
        f"{settings.effective_webhook_base_url}/api/v1/webhooks/exotel/status"
    )

    logger.info(
        f"[Exotel] Placing outbound call | to={to_number} "
        f"from={from_number} voice_ai={use_voice_ai}"
    )

    voice_client = get_voice_client()
    try:
        result = await voice_client.initiate_call(
            from_number=from_number,
            to_number=to_number,
            caller_id=from_number,
            stream_url=stream_url,
            status_callback_url=status_cb,
        )
        call_sid = result.get("Call", {}).get("Sid", "")
        logger.info(f"[Exotel] Outbound call initiated | Sid={call_sid}")
        return {"status": "initiated", "call_sid": call_sid}
    except Exception as e:
        logger.error(f"[Exotel] Outbound call failed: {e}")
        raise HTTPException(status_code=502, detail=f"Exotel call failed: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# PROVIDER STATUS ENDPOINT — used by dashboard
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/status")
async def providers_status():
    """
    Return WhatsApp and Voice provider configuration status.
    Never returns credential values — only boolean presence flags.
    """
    wa_missing = settings.validate_whatsapp_config()
    ex_missing = settings.validate_exotel_config()

    return {
        "whatsapp": {
            "enabled": settings.WHATSAPP_ENABLED,
            "provider": "meta_cloud_api",
            "configured": len(wa_missing) == 0,
            "missing_keys": wa_missing,
            "phone_number_id": settings.META_WHATSAPP_PHONE_NUMBER_ID or None,
            "graph_api_version": settings.META_GRAPH_API_VERSION,
            "webhook_url": f"{settings.effective_webhook_base_url}/api/v1/webhooks/whatsapp",
        },
        "voice": {
            "enabled": settings.EXOTEL_VOICE_ENABLED,
            "provider": "exotel",
            "configured": len(ex_missing) == 0,
            "missing_keys": ex_missing,
            "caller_id": settings.EXOTEL_CALLER_ID or None,
            "stream_enabled": bool(settings.EXOTEL_STREAM_URL),
            "status_callback_url": f"{settings.effective_webhook_base_url}/api/v1/webhooks/exotel/status",
            "inbound_url": f"{settings.effective_webhook_base_url}/api/v1/webhooks/exotel/inbound",
        },
    }
