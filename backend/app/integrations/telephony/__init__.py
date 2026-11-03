"""Tone (usetone.ai) Voice API integration — primary telephony provider."""
from .tone_client import ToneVoiceClient, MockToneClient, get_tone_client

# Provider-agnostic alias so callers don't need to know which backend is active.
get_voice_client = get_tone_client

__all__ = ["ToneVoiceClient", "MockToneClient", "get_tone_client", "get_voice_client"]
