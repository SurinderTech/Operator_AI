"""
AI Business Employee -- FastAPI Application Entry Point
"""
import uvicorn
import time
import sys
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.logging import setup_logging
from app.database.session import init_db
from app.api.v1 import router as api_v1_router

# Force UTF-8 stdout so print() doesn't crash on Windows cp1252
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = open(sys.stdout.fileno(), mode="w", encoding="utf-8", buffering=1)

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown."""
    import os, json
    from app.core.logging import logger
    from app.core.redis import get_redis, close_redis

    print(f"\n{'='*60}")
    print(f"  [START] {settings.APP_NAME} v{settings.APP_VERSION}")
    print(f"  [API]   http://localhost:8000")
    print(f"  [DOCS]  http://localhost:8000/docs")
    print(f"  [AUTH]  http://localhost:8000/api/v1/auth/login")
    print(f"  [CORS]  {settings.CORS_ORIGINS}")
    print(f"{'='*60}\n")
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")

    await init_db()
    await get_redis()   # warm-up Redis (logs warning if down, does NOT crash)

    # ── Meta WhatsApp Cloud API diagnostics ───────────────────────────────────
    wa_missing = settings.validate_whatsapp_config()
    if not settings.WHATSAPP_ENABLED:
        print("  [WA]    WhatsApp disabled (WHATSAPP_ENABLED=false)")
    elif wa_missing:
        print(f"  [WA]    ⚠  WhatsApp not fully configured — missing: {', '.join(wa_missing)}")
        print(f"  [WA]    Falling back to MockWhatsAppClient (no real messages sent)")
    else:
        print(f"  [WA]    ✅ Meta WhatsApp Cloud API configured")
        print(f"  [WA]    Phone Number ID: {settings.META_WHATSAPP_PHONE_NUMBER_ID}")
        print(f"  [WA]    Graph API: {settings.META_GRAPH_API_VERSION}")
        print(f"  [WA]    Webhook: {settings.effective_webhook_base_url}/api/v1/webhooks/whatsapp")

    # ── Exotel Voice diagnostics ──────────────────────────────────────────────
    ex_missing = settings.validate_exotel_config()
    if not settings.EXOTEL_VOICE_ENABLED:
        print("  [VOICE] Voice disabled (EXOTEL_VOICE_ENABLED=false)")
    elif ex_missing:
        print(f"  [VOICE] ⚠  Exotel not fully configured — missing: {', '.join(ex_missing)}")
        print(f"  [VOICE] Falling back to MockVoiceClient (no real calls placed)")
    else:
        print(f"  [VOICE] ✅ Exotel Voice configured")
        print(f"  [VOICE] Caller ID: {settings.EXOTEL_CALLER_ID or '(not set)'}")
        print(f"  [VOICE] AgentStream: {'✅ ' + settings.EXOTEL_STREAM_URL if settings.EXOTEL_STREAM_URL else '— not configured'}")
        print(f"  [VOICE] Inbound URL: {settings.effective_webhook_base_url}/api/v1/webhooks/exotel/inbound")

    # ── Google Calendar diagnostics ───────────────────────────────────────────
    _gcal_creds_raw = settings.GOOGLE_CALENDAR_CREDENTIALS_JSON.strip() \
                      or os.environ.get("GOOGLE_CALENDAR_CREDENTIALS_JSON", "").strip()
    _gcal_token_raw = settings.GOOGLE_CALENDAR_TOKEN_JSON.strip() \
                      or os.environ.get("GOOGLE_CALENDAR_TOKEN_JSON", "").strip()

    _creds_valid = False
    if _gcal_creds_raw:
        try:
            _outer = json.loads(_gcal_creds_raw)
            _client = _outer.get("web") or _outer.get("installed")
            _creds_valid = bool(_client and _client.get("client_id") and _client.get("client_secret"))
        except Exception:
            pass

    _token_valid = False
    if _gcal_token_raw:
        try:
            _t = json.loads(_gcal_token_raw)
            _token_valid = bool(_t.get("refresh_token"))
        except Exception:
            pass

    print(f"  [GCAL]  Credentials configured: {_creds_valid}")
    print(f"  [GCAL]  Token configured:        {_token_valid}")
    if _creds_valid and _token_valid:
        print("  [GCAL]  ✅ Google Calendar fully configured")
    elif _creds_valid:
        print("  [GCAL]  INFO: Open /api/v1/auth/google/calendar to authorise")
    else:
        print("  [GCAL]  WARNING: GOOGLE_CALENDAR_CREDENTIALS_JSON not set")
    print()

    print("[OK] Backend ready — waiting for requests...\n")
    yield
    await close_redis()
    logger.info("Shutting down Operator AI")
    print("\n[STOP] Backend shutdown complete.\n")



app = FastAPI(
    title="AI Business Employee API",
    description="The complete AI employee backend: calls, leads, CRM, calendar, WhatsApp.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# -- CORS -----------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -- Request logger middleware --------------------------------------------------
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    print(f"  --> {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        duration_ms = (time.time() - start) * 1000
        status = response.status_code
        tag = "[OK]" if status < 400 else ("[WARN]" if status < 500 else "[ERR]")
        print(f"  {tag} {request.method} {request.url.path} -> {status} ({duration_ms:.0f}ms)")
        return response
    except Exception as exc:
        duration_ms = (time.time() - start) * 1000
        print(f"  [CRASH] {request.method} {request.url.path} -> 500 ({duration_ms:.0f}ms): {exc}")
        return JSONResponse(status_code=500, content={"detail": str(exc)})


# -- Routers --------------------------------------------------------------------
app.include_router(api_v1_router, prefix="/api/v1")


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": settings.APP_NAME, "version": settings.APP_VERSION}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )