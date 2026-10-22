![Operator AI demo](assets/c4cbe309-153b-4ce8-93d3-24ffc90bdef6.gif)

# Operator AI — Setup & Developer Guide

## Architecture Overview

```
Customer (WhatsApp) ──► Meta Cloud API ──► POST /webhooks/whatsapp
Customer (Phone)     ──► Exotel Voice  ──► POST /webhooks/exotel/inbound
                                               │
                                     LangGraph Orchestrator
                                               │
                             ┌─────────────────┼──────────────────┐
                         Lead Agent    Booking Agent     Support Agent
                                               │
                         ┌─────────────────────┼──────────────────┐
                       CRM           Google Calendar          RAG / KB
                    (HubSpot)                              (pgvector)
                                               │
                                  Reply sent via same channel:
                           WhatsApp → Meta Cloud API send
                           Voice → ExoML / Exotel AgentStream
```

**No Twilio dependency.** The application starts without any Twilio credentials.

---

## Required Accounts

| Service | Purpose | Signup |
|---|---|---|
| Meta Developer App | WhatsApp Cloud API | https://developers.facebook.com/ |
| Exotel | India voice telephony | https://my.exotel.com/ |
| Google AI Studio | Gemini LLM | https://aistudio.google.com/ |
| HubSpot (optional) | CRM sync | https://app.hubspot.com/ |
| Google Cloud (optional) | Calendar booking | https://console.cloud.google.com/ |

---

## Quick Start (Local Development)

### 1. Clone and set up environment

```bash
git clone <repo>
cd Ai_Employe

# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### 2. Configure environment

```bash
# Copy the template
cp .env.example backend/.env
# Edit backend/.env with your credentials
```

### 3. Start services

```bash
# Terminal 1 — Backend
cd backend
.venv\Scripts\activate
py -m uvicorn main:app --reload

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Backend: http://localhost:8000  
Frontend: http://localhost:3000  
API docs: http://localhost:8000/docs

---

## Meta WhatsApp Cloud API Setup

### Step 1 — Create Meta Developer App

1. Go to https://developers.facebook.com/
2. Click **My Apps → Create App**
3. Choose **Business** type
4. Add the **WhatsApp** product to your app
5. Link your **WhatsApp Business Account**

### Step 2 — Get credentials

From **WhatsApp → API Setup**:
- **Phone Number ID** → `META_WHATSAPP_PHONE_NUMBER_ID`
- **WhatsApp Business Account ID** → `META_WHATSAPP_BUSINESS_ACCOUNT_ID`
- Generate a **System User** permanent token → `META_WHATSAPP_ACCESS_TOKEN`
- From **App Settings → Basic**: copy **App Secret** → `META_APP_SECRET`

### Step 3 — Set up webhook (requires public HTTPS URL)

**Option A: ngrok tunnel (development)**

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 8000
# Copy the https://xxxxx.ngrok-free.app URL
```

Set in `backend/.env`:
```
WEBHOOK_BASE_URL=https://xxxxx.ngrok-free.app
META_WHATSAPP_VERIFY_TOKEN=choose_any_secret_string
```

**In Meta Developer Console:**
1. WhatsApp → Configuration → Webhooks
2. **Callback URL**: `https://xxxxx.ngrok-free.app/api/v1/webhooks/whatsapp`
3. **Verify Token**: same value as `META_WHATSAPP_VERIFY_TOKEN`
4. Click **Verify and Save**
5. Subscribe to **messages** field

### Step 4 — Test with Meta test number

Meta provides a free test number and up to 5 authorized recipient numbers.

1. WhatsApp → API Setup → **To** field: add your personal number
2. Click **Send message** to send a test template
3. Reply from your phone — check backend logs for the webhook event
4. Verify AI response arrives via WhatsApp

> **Trial restriction:** The test number can only message authorized recipients. Add up to 5 phone numbers in the dashboard.

### Webhook URL reference

| Purpose | URL |
|---|---|
| Verification (GET) | `GET /api/v1/webhooks/whatsapp` |
| Inbound messages (POST) | `POST /api/v1/webhooks/whatsapp` |
| Provider status | `GET /api/v1/webhooks/status` |
| Webhook URL hints | `GET /api/v1/integrations/public/webhook-urls` |

---

## Exotel Voice Setup (India)

### Step 1 — Create Exotel account

1. Sign up at https://my.exotel.com/
2. Trial accounts get test credits and a virtual number
3. Full trial setup: https://docs.exotel.com/business-phone-system/create-a-trial-account

### Step 2 — Get credentials

From Exotel dashboard:
- **Account SID**: shown in dashboard header → `EXOTEL_ACCOUNT_SID`
- **API Key + Token**: Settings → API → Create new key → `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`
- **Base URL**: `https://api.exotel.com/v1/Accounts/{YOUR_ACCOUNT_SID}` → `EXOTEL_API_BASE_URL`
- **ExoPhone**: Buy/assign a DID number → `EXOTEL_CALLER_ID`

### Step 3 — Configure inbound call routing

1. Exotel Dashboard → **Apps** → Create App
2. Set **App URL** to: `https://your-public-url.com/api/v1/webhooks/exotel/inbound`
3. Assign the App to your ExoPhone number
4. Set `EXOTEL_APP_OR_FLOW_URL` in `.env`

### Step 4 — Voice AI / AgentStream (bidirectional streaming)

For real-time AI voice conversations:

1. Deploy a WebSocket server that implements Exotel's AgentStream protocol
   - Docs: https://developer.exotel.com/docs/agentstream/connect-voice-ai
   - The server receives audio frames, runs STT, calls AI, runs TTS, sends audio back
2. Set `EXOTEL_STREAM_URL=wss://your-server.com/stream`
3. Exotel will connect the call to your WebSocket for bidirectional audio

> **Trial restriction:** AgentStream / bidirectional streaming may require an approved Exotel account. With a trial account, the standard ExoML flow (`/webhooks/exotel/inbound` → `process`) works for basic AI voice interactions.

### Webhook URL reference

| Purpose | URL |
|---|---|
| Inbound call | `POST /api/v1/webhooks/exotel/inbound` |
| AI voice loop | `POST /api/v1/webhooks/exotel/process` |
| Call status | `POST /api/v1/webhooks/exotel/status` |
| Escalation outcome | `POST /api/v1/webhooks/exotel/dial-status` |
| Place outbound call | `POST /api/v1/webhooks/exotel/call` (auth required) |

---

## Environment Variables Reference

```bash
# ── Meta WhatsApp ──────────────────────────────────────────────────────────
META_WHATSAPP_ACCESS_TOKEN=          # System user permanent token
META_WHATSAPP_PHONE_NUMBER_ID=       # Phone Number ID from Meta console
META_WHATSAPP_BUSINESS_ACCOUNT_ID=   # Business Account ID
META_GRAPH_API_VERSION=v20.0         # Graph API version (update when Meta releases new)
META_WHATSAPP_VERIFY_TOKEN=          # Your chosen webhook verify token
META_APP_SECRET=                     # App Secret for signature verification
WHATSAPP_ENABLED=true

# ── Exotel Voice ──────────────────────────────────────────────────────────
EXOTEL_ACCOUNT_SID=                  # Account SID
EXOTEL_API_KEY=                      # API Key (Basic Auth username)
EXOTEL_API_TOKEN=                    # API Token (Basic Auth password)
EXOTEL_API_BASE_URL=                 # https://api.exotel.com/v1/Accounts/{SID}
EXOTEL_CALLER_ID=                    # Your ExoPhone number
EXOTEL_STREAM_URL=                   # wss:// for AgentStream (optional)
EXOTEL_APP_OR_FLOW_URL=              # Exotel App URL for inbound routing
EXOTEL_VOICE_ENABLED=true

# ── Public URLs ───────────────────────────────────────────────────────────
PUBLIC_BASE_URL=http://localhost:8000
WEBHOOK_BASE_URL=                    # Set to ngrok/production URL for webhooks
```

---

## Running Tests

```bash
cd backend
.venv\Scripts\activate
python -m pytest tests/ -v
```

Tests use mocked HTTP — **no real API calls, no real messages, no real calls**.

```bash
# Run specific suites
python -m pytest tests/test_meta_whatsapp.py -v   # WhatsApp tests
python -m pytest tests/test_exotel_voice.py -v    # Exotel tests
```

---

## Database Migration

New columns added (all nullable, safe on existing DBs):

| Table | Column | Purpose |
|---|---|---|
| `messages` | `provider_message_id` | Deduplication (Meta wamid) |
| `messages` | `channel` | whatsapp / phone / web |
| `calls` | `provider_call_sid` | Exotel call SID |
| `calls` | `provider` | exotel / mock |
| `agents` | `whatsapp_phone_number_id` | Meta Phone Number ID for routing |

Run migration:
```bash
cd backend
python app/database/migrations/0002_meta_exotel_provider_columns.py
```

Rollback:
```bash
python app/database/migrations/0002_meta_exotel_provider_columns.py --downgrade
```

---

## Production Deployment Checklist

### Before going live with real businesses

**Meta WhatsApp:**
- [ ] Complete Meta Business Verification
- [ ] Apply for and receive approved message templates
- [ ] Register a permanent phone number (not the test number)
- [ ] Set `META_APP_SECRET` to enable X-Hub-Signature-256 validation
- [ ] Set `PUBLIC_BASE_URL` / `WEBHOOK_BASE_URL` to your production HTTPS domain
- [ ] Subscribe your WABA to the `messages` webhook field

**Exotel Voice:**
- [ ] Upgrade from trial to paid account for production use
- [ ] Purchase permanent ExoPhone DID numbers
- [ ] Configure call recording permissions if needed
- [ ] Set up AgentStream WebSocket server for real-time AI audio

**Security:**
- [ ] Rotate all credentials that were ever in `.env` committed to git
- [ ] Use a secrets manager (AWS Secrets Manager, GCP Secret Manager) in production
- [ ] Set `DEBUG=false` in production
- [ ] Set `APP_ENV=production` — enables strict signature validation

---

## Common Errors

| Error | Fix |
|---|---|
| `META_WHATSAPP_ACCESS_TOKEN not set` | Add token to `.env`, set `WHATSAPP_ENABLED=true` |
| `Invalid signature` on webhook | Check `META_APP_SECRET` matches App Secret in Meta console |
| `Verify token mismatch` | Check `META_WHATSAPP_VERIFY_TOKEN` matches what you entered in Meta console |
| Exotel `401 Unauthorized` | Check API Key and Token; verify Basic Auth format |
| Exotel `400` on call | ExoPhone (caller ID) may not be assigned to your account |
| `No business found` in webhook | Set `whatsapp_phone_number_id` on your Agent record in DB |
| Mock client in logs | Provider credentials missing — app falls back to mock automatically |

----

## Architecture Decision

- **No Twilio SDK** — removed from `requirements.txt`. All telephony via Exotel REST API over `httpx`.
- **Provider adapters** — `WhatsAppClientBase` / `VoiceClientBase` interfaces let you swap providers without changing orchestrator code.
- **Graceful degradation** — missing credentials → mock mode, not a crash.
- **Signature validation** — Meta X-Hub-Signature-256 validated on every POST; skipped in DEBUG mode only.
- **Deduplication** — in-process wamid set prevents duplicate AI replies from webhook retries.
- **DB backward-compatible** — `twilio_call_sid` kept for existing rows; new `provider_call_sid` used by Exotel.
