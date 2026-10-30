<div align="center">

<img src="assets/banner.jpg" alt="Operator AI Banner" width="100%" />

<br /><br />

<img src="assets/c4cbe309-153b-4ce8-93d3-24ffc90bdef6.gif" alt="Operator AI in action" width="100%" />

</div>

# Operator AI

**The AI workforce that runs your business communications 24/7 -- across WhatsApp, Voice and Web.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![LangGraph](https://img.shields.io/badge/LangGraph-Orchestrator-orange)](https://langchain-ai.github.io/langgraph/)
[![Gemini](https://img.shields.io/badge/Gemini-AI-4285F4?logo=google)](https://aistudio.google.com)
[![pgvector](https://img.shields.io/badge/pgvector-RAG-336791?logo=postgresql)](https://github.com/pgvector/pgvector)

---

## The Problem

Every growing business faces the same brutal reality:

> **Your best leads message at 2 AM. Your team responds at 10 AM. The deal is gone.**

- 68% of customers switch to a competitor if they do not get a timely response
- Small businesses miss 40%+ of inbound calls during business hours
- Hiring a 24/7 support team costs 8 to 20 lakh per year per person
- Your team wastes hours on repetitive questions, manual bookings and follow-ups
- Leads slip through the cracks because no one tracks every conversation

**Operator AI solves all of this -- instantly.**

---

## What is Operator AI?

Operator AI is a **multi-channel AI operator platform** that deploys intelligent agents on behalf of your business.

These agents:

- Answer every WhatsApp message and phone call in seconds, 24/7
- Qualify leads automatically and score them (hot / warm / cold)
- Book appointments directly into your Google Calendar
- Sync to your CRM (HubSpot) in real time
- Remember every customer across conversations, channels and time
- Escalate to a human only when genuinely needed

Think of it as hiring a team of AI employees -- a Receptionist, a Lead Agent, a Booking Agent and a Support Agent -- who never sleep, never get sick and never miss a message.

---

## System Architecture

```
                   +-------------------------------------------------------+
                   |                 OPERATOR AI PLATFORM                  |
                   |                                                       |
 Customer          |  +---------------------------------------------------+|
 (WhatsApp) ------>|  |         FastAPI Webhook Gateway                   ||
                   |  |  POST /api/v1/webhooks/whatsapp                   ||
 Customer          |  |  POST /api/v1/webhooks/tone                       ||
 (Phone) --------->|  +--------------------+---------------------------------+|
                   |                       |                               |
 Customer          |  +--------------------v------------------------------+|
 (Web) ----------->|  |        LangGraph AI Orchestrator                 ||
                   |  |         (Router + Memory + State)                ||
                   |  +-------+----------+------------+------------------+|
                   |          |          |            |                   |
                   |  +-------v-+ +------v--+  +------v------+           |
                   |  |  Lead   | |Booking  |  |  Support    |           |
                   |  |  Agent  | |  Agent  |  |    Agent    |           |
                   |  +-------+-+ +------+--+  +------+------+           |
                   |          +----------+-----------+                    |
                   |  +----------------------------------------------+   |
                   |  |                  Tool Layer                  |   |
                   |  |  HubSpot CRM  Google Calendar  pgvector RAG |   |
                   |  |  Tone Voice API  Meta WhatsApp Cloud API    |   |
                   |  +----------------------------------------------+   |
                   +-------------------------------------------------------+
                                          |
                          +--------------v-----------------+
                          |   Reply sent via same channel  |
                          |  WhatsApp -> Meta Cloud API    |
                          |  Voice    -> Tone Voice API    |
                          +--------------------------------+
```

### Agent Roles

| Agent | Responsibility |
|---|---|
| Receptionist | First contact, intent detection, channel routing |
| Lead Agent | Qualification, scoring hot/warm/cold, CRM sync |
| Booking Agent | Appointment scheduling via Google Calendar |
| Support Agent | FAQs, knowledge base RAG, escalation to human |

---

## User Journey -- From Sign-Up to AI Operator Live

```mermaid
journey
    title Business Owner: Operator AI Onboarding
    section Sign Up
      Visit app and create account: 5: Owner
      Set up business profile: 5: Owner
      Configure AI Operator persona: 4: Owner
    section Connect Channels
      Connect WhatsApp via Meta Cloud API: 4: Owner
      Connect Voice via Tone API: 4: Owner
      Add team members: 3: Owner
    section Train the AI
      Upload knowledge base documents: 5: Owner
      Set FAQ answers: 5: Owner
      Configure escalation rules: 4: Owner
    section Go Live
      First customer message arrives: 5: Customer
      AI responds instantly 24 hours a day: 5: Operator AI
      Lead qualified and CRM synced: 5: Operator AI
      Appointment booked automatically: 5: Operator AI
    section Monitor and Grow
      View analytics dashboard: 5: Owner
      Review conversation logs: 4: Owner
      Refine AI knowledge base: 4: Owner
```

---

## End-to-End Customer Interaction Flow

```mermaid
sequenceDiagram
    participant C as Customer
    participant W as WhatsApp or Phone
    participant G as Webhook Gateway
    participant O as AI Orchestrator
    participant L as Lead Agent
    participant B as Booking Agent
    participant CRM as HubSpot CRM
    participant CAL as Google Calendar

    C->>W: Hi, I am looking for a 2BHK flat
    W->>G: Webhook event POST /webhooks/whatsapp
    G->>O: Route message to Orchestrator
    O->>O: Detect intent - Lead Inquiry
    O->>L: Handoff to Lead Agent
    L->>C: Great! What is your budget range?
    C->>L: 50 to 70 lakhs, need it by March
    L->>CRM: Create Lead with score HOT
    L->>C: Perfect match found! Want to schedule a site visit?
    C->>B: Yes, Saturday 11am works
    B->>CAL: Book appointment and confirm slot
    CAL-->>B: Confirmed
    B->>C: Confirmed! Saturday 11am. You will get a reminder.
    B->>CRM: Update Lead status to Appointment Set
```

---

## Business Owner Dashboard

Once signed up and connected, the Operator AI Dashboard gives you full visibility:

```
+--------------------------------------------------------------+
|  OPERATOR AI DASHBOARD                       All Systems OK  |
+--------------+--------------+--------------+-----------------+
|  Overview    |  Operators   |  Inbox       |  Calls          |
|  Leads       |  Customers   |  Calendar    |  Knowledge      |
|  Analytics   |  Reports     |  Integrations|  Settings       |
+--------------+--------------+--------------+-----------------+
```

| Section | What You See |
|---|---|
| Overview | Real-time KPIs -- calls, messages, leads, conversions |
| Operators | Your AI agents and their current status |
| Inbox | Every customer conversation, AI-handled and human-escalated |
| Calls | Live and recorded call log with AI summaries |
| Leads | Pipeline with scores -- Hot, Warm, Cold |
| Calendar | All AI-booked appointments |
| Knowledge | Documents your AI uses to answer questions |
| Analytics | Response time, conversion rate, agent performance |
| Integrations | WhatsApp, Tone Voice, HubSpot, Google Calendar, pgvector |

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 15+ with pgvector extension
- Redis

### 1. Clone the repository

```bash
git clone https://github.com/SurinderTech/Operator_AI.git
cd Operator_AI
```

### 2. Set up the backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example backend/.env
# Open backend/.env and fill in your credentials
```

### 4. Set up the frontend

```bash
cd frontend
npm install
```

### 5. Start both services

```bash
# Terminal 1 -- Backend (FastAPI)
cd backend
.venv\Scripts\activate
py -m uvicorn main:app --reload

# Terminal 2 -- Frontend (Next.js)
cd frontend
npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |

### Or use Docker

```bash
docker compose up --build
```

---

## Integration Setup

### Meta WhatsApp Cloud API

Lets customers message your business on WhatsApp -- AI replies instantly.

#### Step 1 -- Create a Meta Developer App

1. Go to https://developers.facebook.com/
2. My Apps -> Create App -> Business
3. Add the WhatsApp product
4. Link your WhatsApp Business Account

#### Step 2 -- Collect credentials

From WhatsApp -> API Setup:

| Credential | Environment Variable |
|---|---|
| Phone Number ID | META_WHATSAPP_PHONE_NUMBER_ID |
| Business Account ID | META_WHATSAPP_BUSINESS_ACCOUNT_ID |
| System User Token | META_WHATSAPP_ACCESS_TOKEN |
| App Secret | META_APP_SECRET |

#### Step 3 -- Register your webhook

For local development, expose your backend with ngrok:

```bash
ngrok http 8000
# Copy the https://xxxxx.ngrok-free.app URL
```

In backend/.env:

```
WEBHOOK_BASE_URL=https://xxxxx.ngrok-free.app
META_WHATSAPP_VERIFY_TOKEN=any_secret_string_you_choose
```

In Meta Developer Console -> WhatsApp -> Configuration -> Webhooks:
- Callback URL: https://xxxxx.ngrok-free.app/api/v1/webhooks/whatsapp
- Verify Token: same as META_WHATSAPP_VERIFY_TOKEN
- Subscribe to messages field

#### Webhook reference

| Purpose | URL |
|---|---|
| Verification GET | GET /api/v1/webhooks/whatsapp |
| Inbound messages | POST /api/v1/webhooks/whatsapp |
| Provider health | GET /api/v1/webhooks/status |

---

### Tone Voice API

Handles inbound and outbound phone calls -- AI answers and qualifies callers in real time.

Tone is a developer-first AI voice telephony platform purpose-built for AI phone agents.

#### Step 1 -- Create a Tone account

1. Sign up at https://usetone.ai -- no KYC required for test mode
2. Go to Dashboard -> Developer -> API Keys -> New Key
   - Environment: test (sandbox -- no real calls, no billing)
   - Scopes: write
   - Key format: tone_test_... (test) or tone_live_... (production)

#### Step 2 -- Create an agent and allocate a number

```bash
# 1. Create an agent via API or dashboard
POST https://api.usetone.ai/v1/agents

# 2. Allocate a sandbox number to that agent
POST https://api.usetone.ai/v1/numbers
Body: {"series": "regular", "agentId": "<your_agent_id>"}
```

#### Step 3 -- Register your webhook

```bash
POST https://api.usetone.ai/v1/integrations/webhooks
Body: {
  "url": "https://your-tunnel.ngrok-free.app/api/v1/webhooks/tone",
  "events": ["call.initiated", "call.answered", "call.completed", "call.failed"]
}
```

Copy the whsec_... secret from the response into TONE_WEBHOOK_SECRET -- it is shown once only.

#### Step 4 -- Update your .env

```bash
TELEPHONY_PROVIDER=tone
TONE_API_KEY=tone_test_...
TONE_AGENT_ID=<your_agent_id>
TONE_NUMBER_ID=<your_number_id>
TONE_WEBHOOK_SECRET=whsec_...
TONE_VOICE_ENABLED=true
```

#### Test mode magic numbers (no real carrier needed)

| Number | Behaviour |
|---|---|
| +915555000001 | Answered 45s canned summary |
| +915555000002 | Busy |
| +915555000003 | No answer |
| +915555000004 | Voicemail |
| +915555000005 | DND blocks promotional calls |
| +915555000006 | Answered then opts out |

Going live = swap TONE_API_KEY from tone_test_... to tone_live_... -- nothing else changes.

#### Webhook reference

| Purpose | URL |
|---|---|
| Inbound and status events | POST /api/v1/webhooks/tone |
| Place outbound call | POST /api/v1/webhooks/tone/call (auth required) |

---

### HubSpot CRM (optional)

1. Create a Private App in HubSpot https://app.hubspot.com/ with crm.objects.contacts.write scope
2. Copy the token -> HUBSPOT_ACCESS_TOKEN
3. Copy your Portal ID -> HUBSPOT_PORTAL_ID

### Google Calendar (optional)

1. Enable Google Calendar API in Google Cloud Console https://console.cloud.google.com/
2. Create OAuth 2.0 credentials -> download credentials.json
3. Set path in .env: GOOGLE_CALENDAR_CREDENTIALS_JSON

---

## Environment Variables Reference

```bash
# Application
APP_ENV=development
APP_SECRET_KEY=change_me
DEBUG=true

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/ai_employee_db
REDIS_URL=redis://localhost:6379/0

# Google / Gemini AI
GOOGLE_API_KEY=                      # From Google AI Studio

# Meta WhatsApp
META_WHATSAPP_ACCESS_TOKEN=          # System user permanent token
META_WHATSAPP_PHONE_NUMBER_ID=       # Phone Number ID from Meta console
META_WHATSAPP_BUSINESS_ACCOUNT_ID=   # Business Account ID
META_GRAPH_API_VERSION=v20.0
META_WHATSAPP_VERIFY_TOKEN=          # Your chosen verify token
META_APP_SECRET=                     # App Secret for signature verification
WHATSAPP_ENABLED=true

# Telephony Provider
TELEPHONY_PROVIDER=tone              # tone (default) | exotel

# Tone Voice
TONE_API_BASE_URL=https://api.usetone.ai
TONE_API_KEY=                        # tone_test_... or tone_live_...
TONE_AGENT_ID=                       # Tone agent ID
TONE_NUMBER_ID=                      # Tone phone-number ID
TONE_WEBHOOK_SECRET=                 # whsec_... signing secret
TONE_VOICE_ENABLED=true

# Escalation
ESCALATION_PHONE=                    # Human fallback number
TEAM_WHATSAPP_PHONE=                 # Alert number for hot leads

# Public URLs
PUBLIC_BASE_URL=http://localhost:8000
WEBHOOK_BASE_URL=                    # ngrok/production HTTPS URL

# CRM and Calendar
HUBSPOT_ACCESS_TOKEN=
HUBSPOT_PORTAL_ID=
GOOGLE_CALENDAR_CREDENTIALS_JSON=

# JWT Auth
JWT_SECRET_KEY=change_me_in_production
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

---

## Running Tests

```bash
cd backend
.venv\Scripts\activate
python -m pytest tests/ -v
```

All tests use mocked HTTP -- no real API calls, no real messages, no real calls made.

```bash
python -m pytest tests/test_meta_whatsapp.py -v   # WhatsApp tests
python -m pytest tests/test_tone_voice.py -v      # Tone Voice tests
```

---

## Database Schema

```mermaid
erDiagram
    BUSINESSES ||--o{ AGENTS : owns
    BUSINESSES ||--o{ CUSTOMERS : has
    BUSINESSES ||--o{ CONVERSATIONS : has
    CUSTOMERS ||--o{ LEADS : generates
    CUSTOMERS ||--o{ CONVERSATIONS : participates
    LEADS ||--o{ APPOINTMENTS : triggers
    CONVERSATIONS ||--o{ MESSAGES : contains

    BUSINESSES {
        uuid id PK
        string name
        string industry
        string timezone
    }

    CUSTOMERS {
        uuid id PK
        string full_name
        string phone
        string email
        json preferences
        string crm_id
    }

    LEADS {
        uuid id PK
        string status
        string score
        float budget
        json requirements
    }

    MESSAGES {
        uuid id PK
        string channel
        string provider_message_id
        string content
        string direction
    }
```

### Recent Migrations

| Table | Column | Purpose |
|---|---|---|
| messages | provider_message_id | Deduplication Meta wamid or Tone call ID |
| messages | channel | whatsapp / voice / web |
| calls | provider_call_sid | Tone call SID |
| calls | provider | tone / exotel / mock |
| agents | whatsapp_phone_number_id | Meta Phone Number ID for routing |

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

### Meta WhatsApp

- [ ] Complete Meta Business Verification
- [ ] Approved message templates registered
- [ ] Permanent production phone number registered (not the test number)
- [ ] META_APP_SECRET set to enable X-Hub-Signature-256 validation
- [ ] WEBHOOK_BASE_URL points to your production HTTPS domain
- [ ] Subscribed to the messages webhook field in Meta console

### Tone Voice

- [ ] Swap TONE_API_KEY to tone_live_...
- [ ] KYC completed for Tone production account
- [ ] Production webhook URL registered in Tone dashboard
- [ ] Escalation phone numbers verified

### Security

- [ ] Rotate any credentials that were ever committed to git
- [ ] Use a secrets manager in production
- [ ] DEBUG=false in production
- [ ] APP_ENV=production -- enforces strict signature validation
- [ ] TLS/HTTPS on all webhook endpoints

---

## Troubleshooting

| Error | Fix |
|---|---|
| META_WHATSAPP_ACCESS_TOKEN not set | Add token to .env and set WHATSAPP_ENABLED=true |
| Invalid signature on WhatsApp webhook | Check META_APP_SECRET matches Meta console App Secret |
| Verify token mismatch | META_WHATSAPP_VERIFY_TOKEN must match what you entered in Meta console |
| Tone 401 Unauthorized | Verify TONE_API_KEY format -- tone_test_... or tone_live_... |
| Tone webhook 403 Forbidden | TONE_WEBHOOK_SECRET mismatch -- copy the whsec_... exactly as shown once |
| No business found in webhook | Set whatsapp_phone_number_id on your Agent record in DB |
| Mock client in logs | Provider credentials missing -- app gracefully falls back to mock mode |
| Calendar booking fails | Run OAuth flow: python app/integrations/google_calendar.py --auth |

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| LangGraph orchestrator | Stateful graph-based agent routing with full memory persistence |
| Provider adapters | WhatsAppClientBase and VoiceClientBase let you swap providers without touching orchestrator code |
| Graceful degradation | Missing credentials go to mock mode not a crash -- safe for development |
| Signature validation | Meta X-Hub-Signature-256 and Tone HMAC on every POST; skipped in DEBUG mode only |
| Deduplication | In-process wamid and call-ID set prevents duplicate AI replies from webhook retries |
| pgvector RAG | Knowledge base stored as vector embeddings for semantic FAQ retrieval |
| DB backward-compatible | Legacy columns kept; new provider_call_sid column used for Tone |

---

## Tech Stack

| Layer | Technology |
|---|---|
| AI / LLM | Google Gemini via Google AI Studio |
| Orchestration | LangGraph -- stateful multi-agent graphs |
| Backend | FastAPI + Python 3.11 |
| Frontend | Next.js 15 + TypeScript |
| Database | PostgreSQL 15 + pgvector |
| Cache / Queue | Redis |
| Voice | Tone Voice API |
| Messaging | Meta WhatsApp Cloud API |
| CRM | HubSpot |
| Calendar | Google Calendar API |
| Containerisation | Docker + Docker Compose |

---

## Contributing

1. Fork the repository
2. Create a feature branch: git checkout -b feature/your-feature
3. Commit: git commit -m "feat: add your feature"
4. Push: git push origin feature/your-feature
5. Open a Pull Request

---

## License

MIT -- see LICENSE for details.

---

Built with love by SurinderTech -- https://github.com/SurinderTech

Operator AI -- Your AI workforce, always on.
