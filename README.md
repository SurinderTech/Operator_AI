<div align="center">

<img src="./assets/ai-employee.gif" alt="Operator AI Demo" width="850">

# Operator AI — AI Business Operator

**An autonomous AI operator that answers calls, handles WhatsApp conversations, qualifies leads, books appointments, updates your CRM, and executes business workflows — without manual effort.**

Operator AI connects your phone number and WhatsApp line to an intelligent agent that understands natural language, uses your business data, takes real actions through connected tools, and involves a human only when human judgment is actually required.

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2015-black?logo=next.js)](https://nextjs.org)
[![LangGraph](https://img.shields.io/badge/AI-LangGraph-4B6BFB?logo=langchain)](https://langchain-ai.github.io/langgraph/)
[![Gemini](https://img.shields.io/badge/LLM-Gemini%201.5-4285F4?logo=google)](https://ai.google.dev)
[![Twilio](https://img.shields.io/badge/Telephony-Twilio-F22F46?logo=twilio&logoColor=white)](https://twilio.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

</div>

---

## What Is Operator AI

Businesses spend a huge amount of time on repetitive operational work:

- Answering routine calls
- Responding to WhatsApp messages
- Collecting customer information
- Qualifying enquiries
- Updating CRM records
- Checking calendar availability
- Booking appointments
- Sending confirmations
- Answering the same questions repeatedly
- Following predefined workflows

Operator AI is designed to **take over that work**.

It is an autonomous AI business operator that can communicate with customers, understand their intent, retrieve business knowledge, call external tools, update systems, and complete workflows from beginning to end.

A typical interaction can look like:

```text
Customer calls
      ↓
Operator AI answers
      ↓
Understands the request
      ↓
Retrieves business information
      ↓
Creates / updates customer record
      ↓
Qualifies the enquiry
      ↓
Books appointment if required
      ↓
Updates CRM
      ↓
Sends confirmation
      ↓
Conversation completed
```

The goal is simple:

> **If AI can reliably do the work, humans shouldn't have to spend their time doing it manually.**

Humans remain available for exceptions, decisions, sensitive situations, and tasks that genuinely require human judgment.

---

## The Problem

A large part of business operations still depends on people manually moving information between conversations and software.

| Traditional Workflow | What It Costs |
|---|---|
| Customer calls → nobody answers | Missed opportunity |
| Employee answers → manually takes notes | Human time |
| Information is manually entered into CRM | Repetitive work |
| Customer asks routine questions | Employee time spent repeatedly |
| Appointment requested → manual calendar checking | Unnecessary back-and-forth |
| WhatsApp conversations handled manually | Slow and inconsistent responses |
| Customer information exists across different systems | Context gets lost |
| Follow-up depends on someone remembering | Opportunities are missed |

The problem is not that employees cannot do this work.

**The problem is that humans are spending time doing work that software can increasingly execute.**

Operator AI turns those repetitive workflows into autonomous AI workflows.

---

## The Operator AI Approach

Operator AI acts as a software-deployed business operator that can communicate, reason, use tools, and execute actions.

```text
                         CUSTOMER
                            │
                 ┌──────────┴──────────┐
                 │                     │
               Phone                WhatsApp
                 │                     │
                 └──────────┬──────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │  AI Receptionist │
                  │                  │
                  │ Memory + RAG     │
                  │ Business Context │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ Intent Classifier│
                  └────────┬─────────┘
                           │
             ┌─────────────┼──────────────┐
             │             │              │
             ▼             ▼              ▼
          Lead          Booking        Support
          Agent          Agent          Agent
             │             │              │
             └─────────────┼──────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Tool Calls  │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
      CRM              Calendar             RAG
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                           ▼
                    AI Responder
                           │
                  ┌────────┴────────┐
                  │                 │
                Voice              Text
                  │                 │
                  └────────┬────────┘
                           ▼
                       CUSTOMER
```

The human is not the default workflow.

**The human is the escalation path when AI should not continue on its own.**

---

# Core Features

## 🧠 AI Orchestrator — LangGraph

Operator AI uses a stateful multi-agent architecture built on LangGraph.

Every customer interaction passes through an intelligent workflow:

```text
Receptionist
     ↓
Intent Classifier
     ↓
┌────┼────────┬──────────────┐
↓    ↓        ↓              ↓
Lead Booking Support   Human Handoff
     ↓
Responder
```

Each node can perform real actions using agent-callable tools.

Every execution is observable through persisted:

- `AgentRun`
- `ToolCall`
- `Conversation`
- `Message`
- `HumanHandoff`

records.

This makes the system more than a conversational chatbot.

**It is an action-oriented AI system.**

---

## 📞 Voice AI — Twilio

Operator AI can answer inbound phone calls through Twilio.

The voice workflow:

1. Customer calls the business number
2. Twilio receives the call
3. Operator AI answers
4. Customer speech is transcribed
5. The AI orchestrator processes the request
6. Relevant tools and business data are accessed
7. AI generates a response
8. The response is converted to speech
9. The conversation continues until completion or escalation

The system persists call information including:

- Call status
- Duration
- Conversation
- Recording information
- Agent execution
- Tool calls

The current voice configuration uses Amazon Polly with Indian English support.

---

## 💬 WhatsApp AI

Operator AI can handle inbound WhatsApp conversations through Twilio.

```text
WhatsApp Message
       ↓
Twilio Webhook
       ↓
FastAPI
       ↓
AI Orchestrator
       ↓
Business Tools
       ↓
AI Response
       ↓
WhatsApp
```

The same AI intelligence used for phone conversations can operate through WhatsApp.

This means a customer can:

- Ask questions
- Provide requirements
- Request information
- Ask for an appointment
- Receive confirmations
- Continue previous conversations

without requiring someone to manually handle every message.

---

## 🎯 Lead Management + Scoring

When a customer expresses buying or service intent, Operator AI can automatically create a `Lead`.

Relevant information can be extracted from natural language, including:

- Budget
- Location
- Requirements
- Property type
- Bedrooms
- Intent
- Purchase timeline

Current lead scoring:

```text
COLD
Low buying intent

WARM
Budget ≥ ₹20L

HOT
Budget ≥ ₹50L
```

The AI can then automatically update the CRM and continue the workflow.

Human attention is only required when the workflow reaches a situation where it is actually useful.

---

## 🔗 HubSpot CRM Automation

Operator AI connects directly with HubSpot.

Instead of requiring someone to manually copy information from a conversation into a CRM, the AI can perform those actions itself.

It can:

- Create contacts
- Create leads
- Update lead information
- Update pipeline stages
- Store relevant customer information
- Synchronize conversation-derived data

Example pipeline:

```text
NEW
 ↓
QUALIFIED
 ↓
PROPOSAL
 ↓
WON
```

A `MockCRM` implementation is also provided for development without external credentials.

---

## 📅 Calendar Automation

Operator AI can use Google Calendar to complete appointment workflows.

Example:

```text
Customer:
"Can I visit tomorrow around 11?"

        ↓

Operator AI
        ↓

Check Calendar
        ↓

Find Available Slot
        ↓

Create Appointment
        ↓

Update CRM
        ↓

Send Confirmation
```

The customer can receive:

- Appointment date
- Appointment time
- Confirmation message
- Google Meet link when enabled

Routine scheduling requires no manual back-and-forth.

---

## 📚 RAG Knowledge Base

Businesses can upload their own documents in formats such as PDF or text.

Operator AI processes these documents into a searchable knowledge base.

```text
Business Documents
        ↓
     Chunking
        ↓
    Embeddings
        ↓
     pgvector
        ↓
 Semantic Search
        ↓
 Relevant Context
        ↓
      AI Model
        ↓
 Customer Answer
```

The AI can therefore answer customer questions using the business's own information.

Examples:

- Product information
- Property details
- Pricing
- Policies
- Services
- FAQs
- Business documentation

This reduces the need for employees to repeatedly answer the same questions.

---

## 🧠 Customer Memory

Operator AI maintains useful customer context across conversations.

For example:

```json
{
  "name": "Rahul",
  "location": "Chandigarh",
  "budget": "₹50L",
  "property_type": "3BHK",
  "bedrooms": 3
}
```

When the same customer contacts the business again, the AI can use their existing context rather than starting from zero.

This enables more natural and personalized interactions.

---

## 🚨 Human Escalation

Operator AI is designed to automate work, not blindly automate everything.

When a situation requires human judgment, the AI can escalate.

Examples:

- Angry customer
- Complaint
- Sensitive situation
- Complex request
- Explicit request for a human
- Situation outside the configured workflow

The escalation workflow:

```text
AI detects escalation
        ↓
Create HumanHandoff
        ↓
Generate conversation summary
        ↓
Send notification
        ↓
Live-dial human
        ↓
Human takes over
```

The human receives the relevant context so the customer does not need to explain everything again.

**AI handles the routine work. Humans handle the exceptions.**

---

# 📊 Business Dashboard

Operator AI includes a Next.js dashboard for managing and observing the AI operator.

The dashboard provides visibility into:

- Live calls
- AI handle rate
- Lead pipeline
- Agent executions
- Tool calls
- Call history
- Customer conversations
- Knowledge base
- Integrations
- Business settings

The dashboard communicates with the FastAPI backend.

---

# 🔐 Authentication

Operator AI uses email-based OTP authentication powered by Brevo.

Authentication includes:

- Email OTP verification
- JWT access tokens
- JWT refresh tokens
- Password hashing
- Secure authentication flows

---

# End-to-End Workflow

The following example shows how Operator AI can handle an entire customer journey autonomously.

```text
Customer calls at 8:45 PM
          │
          ▼
Operator AI answers
          │
          ▼
Customer explains requirement
          │
          ▼
AI understands intent
          │
          ▼
Load customer memory
          │
          ▼
Search business knowledge
          │
          ▼
Extract structured information
          │
          ▼
Create / update lead
          │
          ▼
Sync information to HubSpot
          │
          ▼
Customer asks for appointment
          │
          ▼
Check Google Calendar
          │
          ▼
Book available slot
          │
          ▼
Update CRM
          │
          ▼
Send WhatsApp confirmation
          │
          ▼
Conversation completed
```

### Human effort for the routine workflow:

**Zero.**

---

# Real-World Example

Imagine a real estate business receiving dozens of enquiries every day.

A customer calls:

> "I'm looking for a 3BHK in Baner, around ₹90 lakhs."

Operator AI can:

1. Answer the call
2. Understand the requirement
3. Extract budget, location, and property type
4. Search the business knowledge base
5. Find relevant properties
6. Create a lead
7. Score the lead
8. Sync it to HubSpot
9. Send matching properties through WhatsApp
10. Continue the conversation
11. Check calendar availability
12. Book a property visit
13. Update the CRM
14. Send appointment confirmation

The entire workflow can happen without someone manually entering information into multiple systems.

**The AI does the work.**

---

# This Is Not a Chatbot

Traditional chatbots primarily answer questions.

Operator AI is designed to **take actions**.

| Traditional Chatbot | Operator AI |
|---|---|
| Answers questions | Understands and executes tasks |
| Mostly conversational | Action-oriented |
| Limited context | Persistent customer memory |
| Stateless sessions | Cross-conversation context |
| No external actions | CRM + Calendar + WhatsApp + RAG |
| User performs the next step | AI can perform the next step |
| Fixed responses | Tool-driven workflows |
| Human completes the process | AI completes the routine process |
| Limited observability | AgentRun + ToolCall tracking |

The difference is simple:

> **A chatbot talks. An operator gets things done.**

---

# System Architecture

```text
                         ┌────────────────────┐
                         │      CUSTOMER      │
                         └─────────┬──────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                 PHONE                         WHATSAPP
                    │                             │
                    ▼                             ▼
                 Twilio                         Twilio
                    │                             │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                         ┌──────────────────┐
                         │  FastAPI Backend │
                         │                  │
                         │    Webhooks      │
                         │      APIs        │
                         └────────┬─────────┘
                                  │
                                  ▼
                       ┌────────────────────┐
                       │  LangGraph Agent  │
                       │   Orchestrator     │
                       └─────────┬──────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
        Lead Agent         Booking Agent      Support Agent
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │
                                 ▼
                         ┌─────────────────┐
                         │   Agent Tools   │
                         └────────┬────────┘
                                  │
              ┌───────────────────┼──────────────────┐
              │                   │                  │
              ▼                   ▼                  ▼
           HubSpot          Google Calendar        RAG
              │                   │                  │
              └───────────────────┼──────────────────┘
                                  │
                                  ▼
                            PostgreSQL
                                  │
                                  ▼
                         Next.js Dashboard
```

---

# AI Decision Flow

Every customer message triggers an internal processing pipeline.

| Step | Node | What Happens |
|---|---|---|
| 1 | **Receptionist** | Loads customer memory and business context |
| 2 | **RAG** | Searches relevant business knowledge |
| 3 | **Intent Classifier** | Determines customer intent and extracts entities |
| 4 | **Router** | Routes the request to the appropriate specialist |
| 5 | **Specialist Agent** | Executes real tools and business actions |
| 6 | **Responder** | Generates a natural customer-facing response |
| 7 | **Persistence** | Stores execution, message, customer and tool data |

The workflow is not simply:

```text
Message → LLM → Response
```

It is:

```text
Message
   ↓
Context
   ↓
Memory
   ↓
RAG
   ↓
Intent
   ↓
Decision
   ↓
Tool Execution
   ↓
Result
   ↓
Response
   ↓
Persistence
```

---

# Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 15 | Business dashboard |
| Language | TypeScript | Frontend development |
| Styling | Tailwind CSS | UI |
| Backend | FastAPI | REST API + webhooks |
| Language | Python 3.11+ | Backend |
| AI Framework | LangGraph | Agent orchestration |
| LLM | Gemini | Intent classification + generation |
| Embeddings | Google Embeddings | Semantic search |
| Vector Store | pgvector | RAG retrieval |
| ORM | SQLAlchemy | Database access |
| Database | PostgreSQL | Production storage |
| Database Dev | SQLite | Local development |
| Cache | Redis | Rate limiting / background jobs |
| Telephony | Twilio Voice | Phone communication |
| Messaging | Twilio WhatsApp | WhatsApp communication |
| CRM | HubSpot API | CRM automation |
| Calendar | Google Calendar API | Appointment automation |
| Email | Brevo | OTP authentication |
| Voice | Amazon Polly | Text-to-speech |
| Authentication | JWT + bcrypt | Secure authentication |
| PDF Ingestion | pypdf | Document processing |

---

# Project Structure

```text
operator-ai/
│
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   │
│   ├── app/
│   │   ├── agents/
│   │   │   └── orchestrator/
│   │   │       └── graph.py
│   │   │
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── auth/
│   │   │       ├── businesses/
│   │   │       ├── leads/
│   │   │       ├── conversations/
│   │   │       ├── knowledge/
│   │   │       ├── agents/
│   │   │       ├── calls/
│   │   │       └── webhooks/
│   │   │
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── logging.py
│   │   │   └── redis.py
│   │   │
│   │   ├── integrations/
│   │   │   ├── crm/
│   │   │   │   └── hubspot.py
│   │   │   ├── calendar/
│   │   │   │   └── google_calendar.py
│   │   │   └── whatsapp/
│   │   │       └── twilio_whatsapp.py
│   │   │
│   │   ├── memory/
│   │   │
│   │   ├── models/
│   │   │
│   │   ├── rag/
│   │   │   └── pipeline.py
│   │   │
│   │   ├── security/
│   │   │   └── auth.py
│   │   │
│   │   ├── services/
│   │   │   ├── email.py
│   │   │   └── otp.py
│   │   │
│   │   └── tools/
│   │       ├── crm_tools/
│   │       ├── calendar_tools/
│   │       ├── communication_tools/
│   │       └── search_tools/
│   │
│   └── database/
│       └── session.py
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   │   └── dashboard/
│   │   └── lib/
│   │
│   └── package.json
│
├── assets/
│   └── operator-ai.gif
│
├── .env.example
├── docker-compose.yml
├── LICENSE
└── README.md
```

---

# Local Development

## Prerequisites

- Python 3.11+
- Node.js 18+
- Git

Docker is optional for basic development.

The backend can use SQLite for local development.

---

## 1. Clone

```bash
git clone https://github.com/SurinderTech/Ai_Employe.git
cd Ai_Employe
```

If the repository itself is renamed later:

```bash
git clone <your-new-repository-url>
cd operator-ai
```

---

## 2. Environment Variables

```bash
cp .env.example backend/.env
```

Configure:

```env
GOOGLE_API_KEY=
BREVO_API_KEY=
BREVO_SENDER_EMAIL=

JWT_SECRET_KEY=

DATABASE_URL=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_WHATSAPP_NUMBER=

ESCALATION_PHONE=

HUBSPOT_ACCESS_TOKEN=

GOOGLE_CALENDAR_CREDENTIALS_JSON=
```

---

## 3. Backend

```bash
cd backend

python -m venv .venv
```

### Windows

```bash
.venv\Scripts\activate
```

### macOS / Linux

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the server:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API documentation:

```text
http://localhost:8000/docs
```

---

## 4. Frontend

```bash
cd frontend

npm install

npm run dev
```

Dashboard:

```text
http://localhost:3000
```

---

# Twilio Local Development

To test Voice and WhatsApp locally, expose the backend using ngrok:

```bash
ngrok http 8000
```

Configure the Twilio webhooks:

```text
Voice:
https://<ngrok-url>/api/v1/webhooks/twilio/voice/inbound

WhatsApp:
https://<ngrok-url>/api/v1/webhooks/twilio/whatsapp/inbound
```

---

# Production Deployment

## Recommended Stack

| Component | Service |
|---|---|
| Frontend | Vercel |
| Backend | Render / Railway / EC2 |
| Database | Supabase PostgreSQL + pgvector |
| Redis | Redis Cloud / Upstash |
| Communication | Twilio |
| CRM | HubSpot |
| Calendar | Google Calendar |

---

## Backend — Render

Build command:

```bash
pip install -r requirements.txt
```

Start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Configure all environment variables in the Render dashboard.

Use PostgreSQL for production rather than the local SQLite database.

---

## Frontend — Vercel

```bash
cd frontend
vercel deploy
```

Set:

```env
NEXT_PUBLIC_API_URL=https://your-backend-url.com
```

---

# Security

Operator AI includes multiple security mechanisms.

| Mechanism | Implementation |
|---|---|
| Password hashing | bcrypt + SHA-256 |
| Authentication | JWT |
| 2FA | Email OTP |
| Webhook validation | Twilio signature verification |
| Rate limiting | Redis |
| CORS | Explicit production allowlist |
| Secrets | Environment variables |
| Database | Isolated application access |

Credentials and API keys should never be committed to the repository.

---

# Observability

Operator AI maintains an audit trail of AI execution.

### `AgentRun`

Stores:

- Input
- Intent
- Output
- Latency
- Status

### `ToolCall`

Stores:

- Tool name
- Input arguments
- Output
- Status
- Latency

### `Conversation`

Stores the customer conversation history.

### `Message`

Stores individual customer and AI messages.

### `HumanHandoff`

Stores:

- Escalation reason
- Conversation summary
- Recommended action
- Handoff status

This makes it possible to understand **what the AI did, why it did it, and what happened afterward.**

---

# Integrations

| Integration | Purpose | Status |
|---|---|---|
| Twilio Voice | Inbound calls | ✅ Implemented |
| Twilio WhatsApp | Customer messaging | ✅ Implemented |
| HubSpot | CRM automation | ✅ Implemented |
| Google Calendar | Appointment booking | ✅ Implemented |
| Gemini | AI reasoning + generation | ✅ Implemented |
| Google Embeddings | RAG | ✅ Implemented |
| Brevo | OTP authentication | ✅ Implemented |
| pgvector | Vector search | ✅ Implemented |
| Redis | Rate limiting / jobs | ✅ Implemented |

---

# Limitations

- **LLM latency:** AI response time depends on model and network latency.
- **Intent coverage:** Current workflows are primarily tuned toward the configured business use case.
- **RAG storage:** Production RAG requires PostgreSQL + pgvector.
- **WhatsApp:** Production deployment requires appropriate WhatsApp Business configuration.
- **Voice recognition:** Accuracy depends on call quality, language, and speech recognition configuration.
- **Calendar:** Google Calendar requires the appropriate credentials.
- **Human escalation:** Escalation requires a configured human destination.

---

# Roadmap

## Completed

- [x] LangGraph multi-agent orchestrator
- [x] AI Receptionist
- [x] Intent classification
- [x] Lead creation
- [x] Lead scoring
- [x] Twilio voice workflow
- [x] WhatsApp workflow
- [x] HubSpot CRM integration
- [x] Google Calendar integration
- [x] RAG knowledge base
- [x] Customer memory
- [x] Human escalation
- [x] JWT authentication
- [x] Email OTP authentication
- [x] Next.js dashboard
- [x] AgentRun observability
- [x] ToolCall observability
- [x] Rate limiting

## In Progress

- [ ] Real-time dashboard updates
- [ ] AI operator configuration UI
- [ ] Knowledge base upload UI
- [ ] More business workflow templates

## Planned

- [ ] Multiple AI operators
- [ ] AI Sales Operator
- [ ] AI Support Operator
- [ ] AI Appointment Operator
- [ ] AI Operations Operator
- [ ] Outbound call automation
- [ ] Automated follow-up workflows
- [ ] SMS automation
- [ ] Multi-language support
- [ ] More CRM integrations
- [ ] More industry-specific agents
- [ ] Usage analytics
- [ ] Conversion analytics
- [ ] Multi-business SaaS architecture
- [ ] AI workforce management

---

# The Vision

Operator AI is not meant to be another chatbot.

The bigger idea is an **AI workforce for businesses**.

Today:

```text
              OPERATOR AI
                   │
                   ▼
            AI Receptionist
```

Tomorrow:

```text
                    OPERATOR AI
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
 AI Receptionist    AI Sales Operator   AI Support
        │                │                │
        ├────────────────┼────────────────┤
        │                │                │
        ▼                ▼                ▼
 AI Appointment     AI Researcher     AI Operations
```

Each operator can have:

- Its own role
- Its own tools
- Its own instructions
- Its own knowledge
- Its own memory
- Its own workflows
- Its own permissions

The business owner doesn't need to manage every individual task.

**They configure the system. The AI operates it.**

---

# The Philosophy

> **Humans should make decisions. AI should handle the work.**

The future of business automation isn't another interface where humans click buttons faster.

It's software that can:

**Understand → Decide → Act → Verify → Remember**

Operator AI is built around that idea.

If a task is repetitive, structured, measurable, and can be performed reliably by software:

**Why should a human have to do it manually?**

---

# License

This project is licensed under the **MIT License**.

---

<div align="center">

## Operator AI

**An AI operator that doesn't just talk — it gets the work done.**

**Understand. Decide. Act.**

⭐ Star the repository if you find it useful.

</div>
