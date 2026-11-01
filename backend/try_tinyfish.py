"""Smoke test for app/tinyfish.py: one agent, one search, one fetch.

Run from backend/:  .venv\\Scripts\\python.exe try_tinyfish.py
Add --agent-only, --search-only or --fetch-only to run just one part.
"""
import asyncio
import json
import sys
import time

from dotenv import load_dotenv

load_dotenv()

from app import tinyfish  # noqa: E402  (needs the key loaded first)


async def try_agent():
    print("\n=== TinyAgent on https://example.com ===")
    start = time.monotonic()
    goal = (
        "Read the page. Return JSON: {title: string, main_link_text: string, "
        "main_link_url: string}"
    )
    async for event in tinyfish.run_agent_stream("https://example.com", goal):
        t = f"{time.monotonic() - start:5.1f}s"
        kind = event.get("type")
        if kind == "STARTED":
            print(t, "STARTED run_id =", event.get("run_id"))
        elif kind == "STREAMING_URL":
            print(t, "LIVE VIEW =", event.get("streaming_url"))
        elif kind == "PROGRESS":
            print(t, "PROGRESS:", event.get("purpose"))
        elif kind == "COMPLETE":
            print(t, "COMPLETE status =", event.get("status"))
            print(json.dumps(event.get("result") or event.get("error"), indent=2))


async def try_search():
    print("\n=== TinySearch: 'hackathon project judging ai tool' ===")
    results = await tinyfish.search("hackathon project judging ai tool")
    for r in results[:5]:
        print(f"- {r.get('title')}\n  {r.get('url')}")


async def try_fetch():
    print("\n=== TinyFetch: https://example.com ===")
    data = await tinyfish.fetch(["https://example.com"])
    for r in data["results"]:
        print("title:", r.get("title"))
        print((r.get("text") or "")[:300])
    for e in data["errors"]:
        print("error:", e)


async def main():
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    if only in ("", "--search-only"):
        await try_search()
    if only in ("", "--fetch-only"):
        await try_fetch()
    if only in ("", "--agent-only"):
        await try_agent()


asyncio.run(main())
