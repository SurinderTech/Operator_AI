"""Google Calendar integration — check availability and book appointments."""
import asyncio
import json
from datetime import datetime, timedelta, timezone
from app.core.logging import logger


def _build_credentials(credentials_json: str, token_json: str):
    """
    Build a google.oauth2.credentials.Credentials object from the stored
    authorized-user token JSON.

    Auto-refresh behaviour:
    - If the access token is expired, google-auth will use the refresh_token
      to obtain a new one automatically when the first API call is made.
    - credentials_json (the OAuth client config) is only needed if we want
      to explicitly call creds.refresh(Request()) — the client_id and
      client_secret are already embedded inside the token_json after the
      OAuth callback, so auto-refresh works without credentials_json.
    """
    from google.oauth2.credentials import Credentials

    try:
        token_data = json.loads(token_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"GOOGLE_CALENDAR_TOKEN_JSON is not valid JSON: {exc}") from exc

    required = {"token", "refresh_token", "token_uri", "client_id", "client_secret"}
    missing = required - token_data.keys()
    if missing:
        raise ValueError(
            f"GOOGLE_CALENDAR_TOKEN_JSON is missing required fields: {missing}. "
            "Re-run the OAuth flow at /api/v1/auth/google/calendar"
        )

    creds = Credentials(
        token=token_data["token"],
        refresh_token=token_data["refresh_token"],
        token_uri=token_data["token_uri"],
        client_id=token_data["client_id"],
        client_secret=token_data["client_secret"],
        scopes=token_data.get("scopes", ["https://www.googleapis.com/auth/calendar"]),
    )
    return creds


def _refresh_if_needed(creds):
    """
    Explicitly refresh credentials if expired or expiring soon.
    google-auth refreshes lazily on first API call, but this makes
    errors surface earlier and produces better log messages.
    """
    if creds.expired and creds.refresh_token:
        import google.auth.transport.requests as google_requests
        try:
            creds.refresh(google_requests.Request())
            logger.info("[GCal] Access token refreshed successfully.")
        except Exception as exc:
            logger.error("[GCal] Token refresh failed: %s", exc)
            raise
    return creds


class GoogleCalendarIntegration:
    def __init__(self, credentials_json: str, token_json: str):
        self.credentials_json = credentials_json  # retained for compatibility
        self.token_json = token_json
        self._service = None

    def _get_service(self):
        from googleapiclient.discovery import build

        creds = _build_credentials(self.credentials_json, self.token_json)
        creds = _refresh_if_needed(creds)
        return build("calendar", "v3", credentials=creds)

    async def get_available_slots(
        self,
        calendar_id: str = "primary",
        date: datetime | None = None,
        duration_minutes: int = 60,
        num_slots: int = 5,
    ) -> list[dict]:
        """Returns available time slots for a given date."""
        loop = asyncio.get_event_loop()

        def _fetch():
            service = self._get_service()
            if not date:
                target_date = datetime.now(timezone.utc) + timedelta(days=1)
            else:
                target_date = date

            time_min = target_date.replace(hour=9, minute=0, second=0, microsecond=0)
            time_max = target_date.replace(hour=20, minute=0, second=0, microsecond=0)

            # Get busy slots
            body = {"timeMin": time_min.isoformat(), "timeMax": time_max.isoformat(), "items": [{"id": calendar_id}]}
            freebusy = service.freebusy().query(body=body).execute()
            busy = freebusy.get("calendars", {}).get(calendar_id, {}).get("busy", [])

            # Generate available slots
            available = []
            slot_start = time_min
            while slot_start + timedelta(minutes=duration_minutes) <= time_max and len(available) < num_slots:
                slot_end = slot_start + timedelta(minutes=duration_minutes)
                is_busy = any(
                    datetime.fromisoformat(b["start"]) < slot_end and
                    datetime.fromisoformat(b["end"]) > slot_start
                    for b in busy
                )
                if not is_busy:
                    available.append({
                        "start": slot_start.isoformat(),
                        "end": slot_end.isoformat(),
                        "label": slot_start.strftime("%I:%M %p"),
                    })
                slot_start += timedelta(minutes=30)
            return available

        return await loop.run_in_executor(None, _fetch)

    async def create_event(
        self,
        title: str,
        start_time: datetime,
        duration_minutes: int,
        attendee_email: str | None = None,
        description: str | None = None,
        calendar_id: str = "primary",
    ) -> dict:
        """Creates a calendar event and returns event ID + meet link."""
        loop = asyncio.get_event_loop()

        def _create():
            service = self._get_service()
            end_time = start_time + timedelta(minutes=duration_minutes)
            event = {
                "summary": title,
                "description": description or "",
                "start": {"dateTime": start_time.isoformat(), "timeZone": "Asia/Kolkata"},
                "end": {"dateTime": end_time.isoformat(), "timeZone": "Asia/Kolkata"},
                "conferenceData": {"createRequest": {"requestId": f"ai-{start_time.timestamp()}"}},
                "reminders": {"useDefault": False, "overrides": [
                    {"method": "email", "minutes": 60},
                    {"method": "popup", "minutes": 30},
                ]},
            }
            if attendee_email:
                event["attendees"] = [{"email": attendee_email}]

            result = service.events().insert(
                calendarId=calendar_id,
                body=event,
                conferenceDataVersion=1,
                sendUpdates="all",
            ).execute()
            return {
                "event_id": result["id"],
                "html_link": result.get("htmlLink"),
                "meet_link": result.get("conferenceData", {}).get("entryPoints", [{}])[0].get("uri"),
            }

        return await loop.run_in_executor(None, _create)

    async def cancel_event(self, event_id: str, calendar_id: str = "primary") -> bool:
        loop = asyncio.get_event_loop()
        def _cancel():
            service = self._get_service()
            service.events().delete(calendarId=calendar_id, eventId=event_id, sendUpdates="all").execute()
        await loop.run_in_executor(None, _cancel)
        logger.info(f"🗑️ Calendar event cancelled: {event_id}")
        return True


class MockCalendar:
    """Development mock — no real Google API calls."""
    async def get_available_slots(self, **kwargs) -> list[dict]:
        from datetime import date
        tomorrow = datetime.now() + timedelta(days=1)
        return [
            {"start": tomorrow.replace(hour=11, minute=0).isoformat(), "label": "11:00 AM"},
            {"start": tomorrow.replace(hour=14, minute=30).isoformat(), "label": "2:30 PM"},
            {"start": tomorrow.replace(hour=17, minute=0).isoformat(), "label": "5:00 PM"},
        ]

    async def create_event(self, **kwargs) -> dict:
        return {"event_id": "mock-event-123", "html_link": "#", "meet_link": None}

    async def cancel_event(self, event_id: str, **kwargs) -> bool:
        logger.info(f"[MOCK Calendar] cancel: {event_id}")
        return True
