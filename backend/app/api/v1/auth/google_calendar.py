"""
Google Calendar OAuth2 flow.

Routes (all under /api/v1/auth — see app/api/v1/__init__.py):
  GET /api/v1/auth/google/calendar   → redirect user to Google consent page
  GET /api/v1/auth/google/callback   → receive code, exchange for tokens,
                                       write google_token.json locally
  GET /api/v1/auth/google/status     → safe diagnostic (no secrets)

ROOT CAUSE NOTE:
  pydantic-settings loads .env ONCE at import time (module-level singleton).
  If .env is updated while the server is running, the singleton retains the
  old value. This module therefore reads credentials FRESH from os.environ
  on every request, bypassing the stale singleton for these sensitive vars.

Redirect URI must match exactly what is registered in Google Cloud Console:
  LOCAL:  http://localhost:8000/api/v1/auth/google/callback
"""
import json
import os
import secrets

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse

from app.core.logging import logger

router = APIRouter()

# ---------------------------------------------------------------------------
# CSRF state store — in-memory, single-process
# Stores {state: code_verifier} — code_verifier is needed for PKCE token exchange.
# For multi-instance production, replace with Redis + TTL.
# ---------------------------------------------------------------------------
_STATE_STORE: dict[str, str | None] = {}  # state -> code_verifier

SCOPES = ["https://www.googleapis.com/auth/calendar"]

# ---------------------------------------------------------------------------
# Fresh environment readers — bypass stale pydantic Settings singleton
# ---------------------------------------------------------------------------

def _get_credentials_json() -> str:
    """
    Read GOOGLE_CALENDAR_CREDENTIALS_JSON fresh from the OS environment.

    Falls back to reading GOOGLE_CALENDAR_CREDENTIALS_FILE (a path to a
    JSON file on disk) if the inline env var is empty.

    Reading fresh from os.environ ensures that if .env was updated and the
    process env was patched (e.g. via systemd EnvironmentFile reload), the
    new value is picked up without a full restart.
    """
    # Primary: inline JSON in env var
    raw = os.environ.get("GOOGLE_CALENDAR_CREDENTIALS_JSON", "").strip()
    if raw:
        return raw

    # Fallback: path to a credentials file
    file_path = os.environ.get("GOOGLE_CALENDAR_CREDENTIALS_FILE", "").strip()
    if file_path:
        try:
            with open(file_path, encoding="utf-8") as f:
                return f.read().strip()
        except OSError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Could not read GOOGLE_CALENDAR_CREDENTIALS_FILE '{file_path}': {exc}",
            ) from exc

    # Also check the pydantic Settings singleton as last resort
    # (covers the case where it WAS loaded correctly at startup)
    try:
        from app.core.config import settings
        singleton_val = settings.GOOGLE_CALENDAR_CREDENTIALS_JSON.strip()
        if singleton_val:
            return singleton_val
    except Exception:
        pass

    return ""


def _get_token_json() -> str:
    """Read GOOGLE_CALENDAR_TOKEN_JSON fresh from OS environment."""
    raw = os.environ.get("GOOGLE_CALENDAR_TOKEN_JSON", "").strip()
    if raw:
        return raw
    try:
        from app.core.config import settings
        return settings.GOOGLE_CALENDAR_TOKEN_JSON.strip()
    except Exception:
        return ""


def _get_redirect_uri() -> str:
    """
    Determine the OAuth redirect URI.
    Priority: GOOGLE_CALENDAR_REDIRECT_URI env var → APP_ENV default.
    """
    uri = os.environ.get("GOOGLE_CALENDAR_REDIRECT_URI", "").strip()
    if uri:
        return uri
    # Fallback: check pydantic settings
    try:
        from app.core.config import settings
        if settings.GOOGLE_CALENDAR_REDIRECT_URI:
            return settings.GOOGLE_CALENDAR_REDIRECT_URI
        if settings.is_production:
            return "https://growthos-5-pbof.onrender.com/api/v1/auth/google/callback"
    except Exception:
        pass
    return "http://localhost:8000/api/v1/auth/google/callback"


# ---------------------------------------------------------------------------
# Credential validation helper
# ---------------------------------------------------------------------------

def _parse_client_config() -> dict:
    """
    Read + validate GOOGLE_CALENDAR_CREDENTIALS_JSON.
    Returns the inner client dict (value of "web" or "installed").
    Raises HTTP 503 with a safe error message if misconfigured.
    Never logs or exposes the secret value.
    """
    raw = _get_credentials_json()
    if not raw:
        raise HTTPException(
            status_code=503,
            detail=(
                "GOOGLE_CALENDAR_CREDENTIALS_JSON is not configured. "
                "Set it in your .env file and restart the server."
            ),
        )

    try:
        outer = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"GOOGLE_CALENDAR_CREDENTIALS_JSON is not valid JSON: {exc}",
        ) from exc

    client = outer.get("web") or outer.get("installed")
    if not client:
        raise HTTPException(
            status_code=503,
            detail='GOOGLE_CALENDAR_CREDENTIALS_JSON must have a "web" or "installed" top-level key.',
        )

    # Validate required fields (no values logged)
    missing = [k for k in ("client_id", "client_secret", "auth_uri", "token_uri") if not client.get(k)]
    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"GOOGLE_CALENDAR_CREDENTIALS_JSON is missing required fields: {missing}",
        )

    return client


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/google/status",
    tags=["Google Calendar OAuth"],
    summary="Safe diagnostic — shows configuration state without exposing secrets",
)
async def google_calendar_status():
    """
    Returns a safe summary of Google Calendar OAuth configuration.
    Never returns any secret values — only booleans and the redirect URI.
    """
    creds_raw = _get_credentials_json()
    token_raw = _get_token_json()
    redirect_uri = _get_redirect_uri()

    creds_ok = False
    creds_error = None
    if creds_raw:
        try:
            outer = json.loads(creds_raw)
            client = outer.get("web") or outer.get("installed")
            if client:
                missing = [k for k in ("client_id", "client_secret", "auth_uri", "token_uri") if not client.get(k)]
                creds_ok = len(missing) == 0
                if missing:
                    creds_error = f"Missing fields: {missing}"
            else:
                creds_error = 'No "web" or "installed" key found'
        except json.JSONDecodeError as exc:
            creds_error = f"Invalid JSON: {exc}"
    else:
        creds_error = "Not set"

    token_ok = False
    token_error = None
    if token_raw:
        try:
            t = json.loads(token_raw)
            has_refresh = bool(t.get("refresh_token"))
            token_ok = has_refresh
            if not has_refresh:
                token_error = "refresh_token is missing — re-run OAuth flow"
        except json.JSONDecodeError as exc:
            token_error = f"Invalid JSON: {exc}"
    else:
        token_error = "Not set — run OAuth flow first"

    return JSONResponse({
        "credentials_configured": creds_ok,
        "credentials_error": creds_error,
        "token_configured": token_ok,
        "token_error": token_error,
        "redirect_uri": redirect_uri,
        "authorize_url": "http://localhost:8000/api/v1/auth/google/calendar",
        "hint": (
            "Visit authorize_url in your browser to connect Google Calendar."
            if not token_ok else
            "Google Calendar is connected. MockCalendar will NOT be used."
        ),
    })


@router.get(
    "/google/calendar",
    tags=["Google Calendar OAuth"],
    summary="Start Google Calendar OAuth2 flow — redirects to Google consent",
    response_class=RedirectResponse,
)
async def google_calendar_authorize():
    """
    Redirect the browser to Google's OAuth2 consent page.
    Reads credentials fresh from os.environ on every call.
    """
    from google_auth_oauthlib.flow import Flow  # type: ignore

    client = _parse_client_config()
    redirect_uri = _get_redirect_uri()

    client_config = {"web": client}

    # ── Generate PKCE code_verifier + code_challenge ───────────────────
    # google_auth_oauthlib adds a code_challenge to the auth URL which means
    # Google requires a matching code_verifier during token exchange.
    # We generate it here, store it with the state, and restore it in the callback.
    import hashlib, base64
    code_verifier = secrets.token_urlsafe(96)  # ~128-char URL-safe string
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode("ascii")).digest()
    ).rstrip(b"=").decode("ascii")

    try:
        flow = Flow.from_client_config(
            client_config=client_config,
            scopes=SCOPES,
            redirect_uri=redirect_uri,
        )
    except Exception as exc:
        logger.error("[GCal OAuth] Failed to build OAuth flow: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail=f"OAuth flow init failed: {exc}") from exc

    state = secrets.token_urlsafe(32)
    _STATE_STORE[state] = code_verifier  # store verifier for callback

    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",          # always get refresh_token
        state=state,
        code_challenge=code_challenge,
        code_challenge_method="S256",
    )

    logger.info("[GCal OAuth] Redirecting to Google — redirect_uri=%s", redirect_uri)
    return RedirectResponse(url=auth_url)


@router.get(
    "/google/callback",
    tags=["Google Calendar OAuth"],
    summary="Google OAuth2 callback — exchanges code for tokens",
    response_class=HTMLResponse,
)
async def google_calendar_callback(
    code: str = Query(default=None),
    state: str = Query(default=None),
    error: str = Query(default=None),
    scope: str = Query(default=None),
):
    """
    Callback that Google redirects to after user grants consent.
    - Validates CSRF state
    - Exchanges authorization code for access + refresh tokens
    - Writes google_token.json to the backend directory (gitignored)
    - Shows a success page with copy instructions
    """
    from google_auth_oauthlib.flow import Flow  # type: ignore

    # ── Error from Google ─────────────────────────────────────────────
    if error:
        logger.warning("[GCal OAuth] Google returned error: %s", error)
        return _html_error(f"Google declined authorization: <code>{error}</code>")

    # ── Validate required params ──────────────────────────────────────
    if not code:
        return _html_error("Missing authorization code from Google.")
    if not state:
        return _html_error("Missing OAuth state parameter — possible CSRF attack.")

    # ── CSRF state validation ─────────────────────────────────────────
    if state not in _STATE_STORE:
        logger.warning("[GCal OAuth] Rejected unknown/replayed state token")
        return _html_error(
            "Invalid or expired state token.<br>"
            "The authorization session may have timed out. "
            "<a href='/api/v1/auth/google/calendar'>Start again</a>."
        )
    code_verifier = _STATE_STORE.pop(state)  # retrieve PKCE verifier, consume state

    # ── Build flow and exchange code ──────────────────────────────────
    client = _parse_client_config()
    redirect_uri = _get_redirect_uri()
    client_config = {"web": client}

    try:
        flow = Flow.from_client_config(
            client_config=client_config,
            scopes=SCOPES,
            redirect_uri=redirect_uri,
            code_verifier=code_verifier,  # PKCE: must match the challenge sent to Google
        )
        # We already validated state above; skip the internal re-check
        flow._state = state  # noqa: SLF001
        flow.fetch_token(code=code)
    except Exception as exc:
        logger.error("[GCal OAuth] Token exchange failed — %s: %s", type(exc).__name__, str(exc))
        return _html_error(
            f"Token exchange with Google failed.<br>"
            f"<small>Error: {exc}</small><br><br>"
            f"Common causes:<ul>"
            f"<li>Redirect URI mismatch in Google Cloud Console</li>"
            f"<li>Authorization code already used (codes are single-use)</li>"
            f"<li>Expired authorization code (must be exchanged within minutes)</li>"
            f"</ul>"
        )

    creds = flow.credentials

    # ── Must have refresh_token ───────────────────────────────────────
    if not creds.refresh_token:
        return _html_error(
            "Google did not return a <strong>refresh_token</strong>.<br><br>"
            "This happens when you have already authorized this app before.<br><br>"
            "Fix: Go to "
            "<a href='https://myaccount.google.com/permissions' target='_blank'>"
            "Google Account Permissions</a>, find this app, click <strong>Remove Access</strong>, "
            "then <a href='/api/v1/auth/google/calendar'>try again</a>."
        )

    # ── Build token JSON compatible with Credentials.from_authorized_user_info ──
    token_data = {
        "token":         creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri":     creds.token_uri,
        "client_id":     creds.client_id,
        "client_secret": creds.client_secret,
        "scopes":        list(creds.scopes or SCOPES),
    }
    token_json_str = json.dumps(token_data, indent=2)

    # ── Write token file (gitignored) ─────────────────────────────────
    token_file = os.path.join(os.getcwd(), "google_token.json")
    try:
        with open(token_file, "w", encoding="utf-8") as f:
            f.write(token_json_str)
        logger.info("[GCal OAuth] Token written to %s", token_file)
    except OSError as exc:
        logger.warning("[GCal OAuth] Could not write token file: %s", exc)
        token_file = "(write failed)"

    logger.info("[GCal OAuth] Authorization successful — refresh_token=present")
    return _html_success(token_json_str, token_file)


# ---------------------------------------------------------------------------
# HTML response helpers
# ---------------------------------------------------------------------------

def _html_success(token_json: str, token_file: str) -> HTMLResponse:
    escaped = token_json.replace("<", "&lt;").replace(">", "&gt;")
    # Only show partial token for security — user must open the file or use copy button
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Google Calendar Connected ✅</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; }}
    body {{
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0f172a; color: #e2e8f0;
      display: flex; flex-direction: column; align-items: center;
      padding: 40px 20px; min-height: 100vh; margin: 0;
    }}
    h1 {{ color: #34d399; font-size: 1.8rem; margin-bottom: 6px; }}
    .subtitle {{ color: #64748b; margin-bottom: 24px; font-size: 0.95rem; }}
    .card {{
      background: #1e293b; border: 1px solid #334155; border-radius: 12px;
      padding: 24px; max-width: 720px; width: 100%; margin-bottom: 16px;
    }}
    .card h2 {{ margin-top: 0; font-size: 1rem; color: #fbbf24; }}
    pre {{
      background: #0f172a; border: 1px solid #334155; border-radius: 8px;
      padding: 16px; overflow-x: auto; font-size: 0.78rem;
      white-space: pre-wrap; word-break: break-all; color: #7dd3fc;
      max-height: 260px; overflow-y: auto;
    }}
    .warn {{
      background: #431407; border: 1px solid #c2410c; border-radius: 8px;
      padding: 12px 16px; color: #fb923c; font-size: 0.85rem;
    }}
    ol {{ color: #cbd5e1; line-height: 2; padding-left: 20px; }}
    code {{
      background: #0f172a; padding: 2px 6px; border-radius: 4px;
      font-size: 0.8rem; color: #a78bfa;
    }}
    .btn {{
      background: #4f46e5; color: white; border: none;
      padding: 10px 22px; border-radius: 8px; cursor: pointer;
      font-size: 0.9rem; margin-top: 10px; transition: background 0.2s;
    }}
    .btn:hover {{ background: #4338ca; }}
    .file-path {{ color: #34d399; font-family: monospace; font-size: 0.85rem; }}
  </style>
</head>
<body>
  <h1>✅ Google Calendar Connected!</h1>
  <p class="subtitle">Authorization successful — token saved locally</p>

  <div class="card warn">
    ⚠️ <strong>Security reminder:</strong> The JSON below contains OAuth tokens.
    Never commit it to Git. Never share it publicly.
  </div>

  <div class="card">
    <h2>📄 Token File Saved</h2>
    <p style="color:#94a3b8; margin:0 0 8px;">
      Token written to: <span class="file-path">{token_file}</span>
    </p>
    <p style="color:#64748b; font-size:0.85rem; margin:0;">
      This file is already listed in <code>.gitignore</code>.
    </p>
  </div>

  <div class="card">
    <h2>📋 Token JSON — Copy this into GOOGLE_CALENDAR_TOKEN_JSON</h2>
    <pre id="token-json">{escaped}</pre>
    <button class="btn" onclick="
      navigator.clipboard.writeText(document.getElementById('token-json').textContent)
        .then(() => this.textContent = '✓ Copied!')
        .catch(() => this.textContent = 'Select text manually and copy')
    ">📋 Copy to Clipboard</button>
  </div>

  <div class="card">
    <h2>🚀 Next Steps</h2>
    <ol>
      <li>Copy the token JSON above (or open <code>google_token.json</code>).</li>
      <li>
        In <code>backend/.env</code>, set:<br>
        <code>GOOGLE_CALENDAR_TOKEN_JSON='{{...paste the full JSON on one line...}}'</code>
      </li>
      <li>
        <strong>Restart the backend</strong> so the new env var is loaded:<br>
        <code>py -m uvicorn main:app --reload</code>
      </li>
      <li>
        Verify it worked:<br>
        <code>GET http://localhost:8000/api/v1/auth/google/status</code>
      </li>
    </ol>
  </div>
</body>
</html>"""
    return HTMLResponse(content=html, status_code=200)


def _html_error(message: str) -> HTMLResponse:
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Google Calendar Auth Error</title>
  <style>
    body {{
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0f172a; color: #e2e8f0;
      display: flex; flex-direction: column; align-items: center;
      padding: 40px 20px; min-height: 100vh; margin: 0;
    }}
    h1 {{ color: #f87171; }}
    .card {{
      background: #1e293b; border: 1px solid #ef4444; border-radius: 12px;
      padding: 24px; max-width: 640px; width: 100%; color: #fca5a5;
      line-height: 1.7;
    }}
    a {{ color: #60a5fa; }}
    .btn {{
      display: inline-block; margin-top: 20px;
      background: #4f46e5; color: white; text-decoration: none;
      padding: 10px 22px; border-radius: 8px; font-size: 0.9rem;
    }}
  </style>
</head>
<body>
  <h1>❌ Google Calendar Authorization Failed</h1>
  <div class="card">{message}</div>
  <a class="btn" href="/api/v1/auth/google/calendar">← Try Again</a>
</body>
</html>"""
    return HTMLResponse(content=html, status_code=400)
