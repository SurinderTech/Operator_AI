"""
Migration: Add provider-neutral columns for Meta WhatsApp + Exotel
  - messages.provider_message_id  (wamid / Exotel SID — for deduplication)
  - messages.channel              (whatsapp / phone / web / email)
  - calls.provider_call_sid       (Exotel SID)
  - calls.provider                (exotel / mock)
  - agents.whatsapp_phone_number_id (Meta Phone Number ID)

Safe to run on existing databases — all columns are nullable.
Existing twilio_call_sid data is preserved.

Run:
    cd backend
    python -m alembic upgrade head
    # or run this script directly:
    python app/database/migrations/0002_meta_exotel_provider_columns.py
"""
import asyncio
from sqlalchemy import text
from app.database.session import engine


UPGRADE_SQL = """
-- messages: provider message ID for deduplication (e.g. Meta wamid)
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(200),
    ADD COLUMN IF NOT EXISTS channel VARCHAR(50);

CREATE INDEX IF NOT EXISTS ix_messages_provider_message_id
    ON messages (provider_message_id);

-- calls: provider-neutral call SID (Exotel uses this; twilio_call_sid kept for legacy)
ALTER TABLE calls
    ADD COLUMN IF NOT EXISTS provider_call_sid VARCHAR(100),
    ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'exotel';

CREATE UNIQUE INDEX IF NOT EXISTS ix_calls_provider_call_sid
    ON calls (provider_call_sid)
    WHERE provider_call_sid IS NOT NULL;

-- agents: Meta WhatsApp Phone Number ID for routing inbound WA messages
ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS ix_agents_whatsapp_phone_number_id
    ON agents (whatsapp_phone_number_id)
    WHERE whatsapp_phone_number_id IS NOT NULL;
"""

DOWNGRADE_SQL = """
ALTER TABLE messages
    DROP COLUMN IF EXISTS provider_message_id,
    DROP COLUMN IF EXISTS channel;

ALTER TABLE calls
    DROP COLUMN IF EXISTS provider_call_sid,
    DROP COLUMN IF EXISTS provider;

ALTER TABLE agents
    DROP COLUMN IF EXISTS whatsapp_phone_number_id;
"""


async def upgrade():
    async with engine.begin() as conn:
        for stmt in UPGRADE_SQL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                await conn.execute(text(stmt + ";"))
    print("[Migration 0002] ✅ Upgrade complete")


async def downgrade():
    async with engine.begin() as conn:
        for stmt in DOWNGRADE_SQL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                await conn.execute(text(stmt + ";"))
    print("[Migration 0002] ✅ Downgrade complete")


if __name__ == "__main__":
    import sys
    if "--downgrade" in sys.argv:
        asyncio.run(downgrade())
    else:
        asyncio.run(upgrade())
