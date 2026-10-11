"""Application configuration — loaded from environment variables."""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────
    APP_NAME: str = "Operator AI"
    APP_VERSION: str = "0.2.0"
    APP_ENV: str = "development"
    DEBUG: bool = True
    APP_SECRET_KEY: str = "CHANGE_ME"

    # ── Database ─────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://aiemployee:aiemployee_secret@localhost:5432/ai_employee_db"

    # ── Redis ────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── CORS ─────────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ]

    # ── JWT ──────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Google / Gemini ──────────────────────────────────────────────
    GOOGLE_API_KEY: str = ""
    GOOGLE_CLOUD_PROJECT: str = ""
    GOOGLE_CLOUD_REGION: str = "us-central1"
    GEMINI_MODEL: str = "gemini-1.5-pro"
    GEMINI_FAST_MODEL: str = "gemini-1.5-flash"
    EMBEDDING_MODEL: str = "models/text-embedding-004"

    # ── Meta WhatsApp Cloud API ───────────────────────────────────────
    # Official docs: https://developers.facebook.com/docs/whatsapp/cloud-api/
    META_WHATSAPP_ACCESS_TOKEN: str = ""        # Permanent system user token
    META_WHATSAPP_PHONE_NUMBER_ID: str = ""     # Phone Number ID (not the number itself)
    META_WHATSAPP_BUSINESS_ACCOUNT_ID: str = "" # WhatsApp Business Account ID
    META_GRAPH_API_VERSION: str = "v20.0"       # Graph API version
    META_WHATSAPP_VERIFY_TOKEN: str = ""        # Webhook verification token (you choose)
    META_APP_SECRET: str = ""                   # App Secret for X-Hub-Signature-256 verification
    WHATSAPP_ENABLED: bool = True               # Set false to disable WhatsApp entirely

    # ── Exotel Voice (India Telephony) ────────────────────────────────
    # Official docs: https://developer.exotel.com/
    EXOTEL_ACCOUNT_SID: str = ""       # Exotel Account SID / subdomain
    EXOTEL_API_KEY: str = ""           # API Key (Basic Auth username)
    EXOTEL_API_TOKEN: str = ""         # API Token (Basic Auth password)
    EXOTEL_API_BASE_URL: str = ""      # e.g. https://api.exotel.com/v1/Accounts/{sid}
    EXOTEL_CALLER_ID: str = ""         # ExoPhone / DID number for outbound calls
    EXOTEL_STREAM_URL: str = ""        # wss:// endpoint for AgentStream (Voice AI)
    EXOTEL_APP_OR_FLOW_URL: str = ""   # Exotel App URL for inbound call routing
    EXOTEL_VOICE_ENABLED: bool = True  # Set false to disable voice entirely

    # ── Escalation ───────────────────────────────────────────────────
    # Phone number AI routes to when escalating to a human
    ESCALATION_PHONE: str = ""
    # WhatsApp number that receives team alerts on escalation / hot lead
    TEAM_WHATSAPP_PHONE: str = ""
    # Seconds before escalation dial gives up
    ESCALATION_DIAL_TIMEOUT: int = 30

    # ── Public / Webhook base URLs ────────────────────────────────────
    PUBLIC_BASE_URL: str = "http://localhost:8000"  # Public HTTPS base URL for webhooks
    WEBHOOK_BASE_URL: str = ""                       # Override if different from PUBLIC_BASE_URL

    # ── HubSpot ──────────────────────────────────────────────────────
    HUBSPOT_ACCESS_TOKEN: str = ""
    HUBSPOT_PORTAL_ID: str = ""

    # ── Google Calendar ──────────────────────────────────────────────
    GOOGLE_CALENDAR_CREDENTIALS_JSON: str = ""
    GOOGLE_CALENDAR_TOKEN_JSON: str = ""
    GOOGLE_CALENDAR_ID: str = "primary"
    # Explicit redirect URI override — leave blank to auto-detect.
    GOOGLE_CALENDAR_REDIRECT_URI: str = ""

    # ── Brevo (Email) ─────────────────────────────────────────────────
    BREVO_API_KEY: str = ""
    BREVO_SENDER_EMAIL: str = "noreply@aiemployee.app"

    # ── Rate limiting (Redis) ─────────────────────────────────────────
    RATE_LIMIT_CALLS_PER_MINUTE: int = 5
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # ── Properties ───────────────────────────────────────────────────
    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def effective_webhook_base_url(self) -> str:
        return (self.WEBHOOK_BASE_URL or self.PUBLIC_BASE_URL).rstrip("/")

    def validate_whatsapp_config(self) -> list[str]:
        """Return list of missing config keys for WhatsApp. Empty list = all good."""
        if not self.WHATSAPP_ENABLED:
            return []
        missing = []
        for key in ("META_WHATSAPP_ACCESS_TOKEN", "META_WHATSAPP_PHONE_NUMBER_ID",
                    "META_APP_SECRET", "META_WHATSAPP_VERIFY_TOKEN"):
            if not getattr(self, key):
                missing.append(key)
        return missing

    def validate_exotel_config(self) -> list[str]:
        """Return list of missing config keys for Exotel. Empty list = all good."""
        if not self.EXOTEL_VOICE_ENABLED:
            return []
        missing = []
        for key in ("EXOTEL_ACCOUNT_SID", "EXOTEL_API_KEY",
                    "EXOTEL_API_TOKEN", "EXOTEL_API_BASE_URL"):
            if not getattr(self, key):
                missing.append(key)
        return missing


settings = Settings()
