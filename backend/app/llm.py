"""Optional LLM plug-in for nicer wording. LaunchPad works fully without it.

All scores and decisions are made by plain Python rules and TinyFish agents.
If GEMINI_API_KEY or GROQ_API_KEY is set, write() asks that model to phrase a
short summary; otherwise (or on any error) it returns None and callers use
their template text instead.
"""
import os

import httpx

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
TIMEOUT_S = 20


def provider() -> str | None:
    if os.getenv("GEMINI_API_KEY"):
        return "gemini"
    if os.getenv("GROQ_API_KEY"):
        return "groq"
    return None


async def write(prompt: str) -> str | None:
    """Return a short piece of text, or None if no LLM is configured or the call fails."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            if provider() == "gemini":
                model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
                resp = await client.post(
                    GEMINI_URL.format(model=model),
                    headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
                    json={"contents": [{"parts": [{"text": prompt}]}]},
                )
                resp.raise_for_status()
                text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            elif provider() == "groq":
                resp = await client.post(
                    GROQ_URL,
                    headers={"Authorization": f"Bearer {os.environ['GROQ_API_KEY']}"},
                    json={
                        "model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                resp.raise_for_status()
                text = resp.json()["choices"][0]["message"]["content"]
            else:
                return None
        return text.strip() or None
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return None  # the template text is a fine fallback
