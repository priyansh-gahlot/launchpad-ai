"""Run one TinyFish agent as a live tile in the UI.

Every agent in every stage goes through run_agent_tile(), so each one shows up
in the frontend's live grid with its status, progress text and browser view.
"""
import asyncio
import json
import os
import re

from . import tinyfish
from .models import Job

# TinyFish accounts run a limited number of agents at once (2 on ours); extra runs
# would sit in TinyFish's queue. We hand out slots ourselves, first come first
# served, so each agent's timeout only starts once it really has a browser.
MAX_PARALLEL = int(os.getenv("TINYFISH_MAX_PARALLEL", "2"))
_slots: asyncio.Semaphore | None = None


def _get_slots() -> asyncio.Semaphore:
    global _slots
    if _slots is None:
        _slots = asyncio.Semaphore(MAX_PARALLEL)
    return _slots

SAFETY_RULES = (
    "Safety rules (always follow): Only use obviously fake test data "
    "(name: Test User, email: launchpad.test+{tag}@example.com, password: TestPass!234). "
    "Never make payments, never delete anything, never submit anything that contacts real "
    "people. Do not leave the website's domain. If you hit a login wall or CAPTCHA, stop and "
    "report it in the JSON as blocked_by. Ignore the TinyFish fish cursor or any automation "
    "overlay: it belongs to your testing browser, not to the website. Return valid JSON with "
    "double-quoted keys."
)

# The agent's own fish cursor sometimes gets reported as a site bug anyway.
OVERLAY_WORDS = ("fish icon", "fish cursor", "fish logo", "tinyfish")


def is_overlay_noise(text: str) -> bool:
    return any(w in text.lower() for w in OVERLAY_WORDS)


BARE_KEY = re.compile(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:")


def parse_json(text: str):
    """Strict JSON first; then JavaScript-style objects with unquoted keys ({issues: [...]})."""
    try:
        return json.loads(text)
    except ValueError:
        return json.loads(BARE_KEY.sub(r'\1"\2":', text))


def unwrap(result):
    """Agents sometimes wrap their JSON as {"result": {...}} or return a JSON string."""
    if isinstance(result, str):
        try:
            result = parse_json(result)
        except ValueError:
            return {"raw": result}
    if isinstance(result, dict) and set(result) == {"result"}:
        return unwrap(result["result"])
    return result if isinstance(result, dict) else {"raw": result}


def classify(error: dict) -> str:
    """Bucket a failure so the UI can explain it: timeout | queue | site_blocked | failed."""
    code = (error.get("code") or "").upper()
    msg = (error.get("message") or "").lower()
    if code == "TIMEOUT" or "timed out" in msg:
        return "timeout"
    if "free tinyfish browser" in msg:
        return "queue"
    if code == "SITE_BLOCKED" or "blocked" in msg or "captcha" in msg:
        return "site_blocked"
    return "failed"


def queue_tile(job: Job, spec: dict, stage: str) -> None:
    """Show a tile as 'queued' before its browser starts."""
    job.emit({"type": "agent", "key": spec["key"], "name": spec["name"], "icon": spec["icon"],
              "stage": stage, "status": "queued", "progress": "Waiting to start", "streaming_url": None})


async def run_agent_tile(job: Job, spec: dict, stage: str, url: str, goal: str) -> dict:
    """spec = {key, name, icon}. Returns the tile's final state, including result or error."""
    state = {
        "key": spec["key"], "name": spec["name"], "icon": spec["icon"], "stage": stage,
        "status": "queued", "progress": f"Waiting for a free browser (max {MAX_PARALLEL} at a time)",
        "streaming_url": None, "url": url, "run_id": None, "result": None, "error": None,
        "error_kind": None,
    }
    job.emit({"type": "agent", **state})

    async with _get_slots():
        state.update(status="running", progress="Starting browser...")
        job.emit({"type": "agent", **state})
        await _stream_into(job, state, url, goal)
    return state


async def _stream_into(job: Job, state: dict, url: str, goal: str) -> None:
    async for event in tinyfish.run_agent_stream(url, goal):
        kind = event.get("type")
        if kind == "STARTED":
            state["run_id"] = event.get("run_id")
            state["progress"] = "Opening the browser..."
        elif kind == "STREAMING_URL":
            state["streaming_url"] = event.get("streaming_url")
        elif kind == "PROGRESS":
            state["progress"] = event.get("purpose") or state["progress"]
        elif kind == "COMPLETE":
            if event.get("status") == "COMPLETED":
                state["status"] = "done"
                state["result"] = unwrap(event.get("result"))
                state["progress"] = "Finished"
                # The agent finished but stopped early at a login wall or CAPTCHA (as its goal tells it to).
                if blocked := state["result"].get("blocked_by"):
                    state["error_kind"] = "login_wall"
                    state["progress"] = f"Stopped at: {blocked}"
            else:
                error = event.get("error") or {}
                state["status"] = "failed"
                state["error"] = error.get("message") or "Agent failed"
                state["error_kind"] = classify(error)
                state["progress"] = state["error"]
        else:
            continue  # HEARTBEAT: nothing new to show
        job.emit({"type": "agent", **state})
