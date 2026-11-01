"""Tiny JSON-file cache so repeat demos of the same project are instant.

Key: hash of (demo_url, repo_url, idea). Entries expire after 30 minutes.
Only finished reports are stored.
"""
import hashlib
import json
import time
from pathlib import Path

CACHE_FILE = Path(__file__).resolve().parent.parent / "cache" / "reports.json"
TTL_S = 30 * 60


def make_key(idea: str, repo_url: str, demo_url: str, extra_agents: bool = False) -> str:
    raw = "\n".join([demo_url.strip().lower(), repo_url.strip().lower(), " ".join(idea.lower().split()),
                     "extra" if extra_agents else ""])
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _load() -> dict:
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def get(key: str) -> tuple[dict, int] | None:
    """Return (report, age in seconds) if a fresh entry exists."""
    entry = _load().get(key)
    if not entry:
        return None
    age = int(time.time() - entry["saved_at"])
    return (entry["report"], age) if age < TTL_S else None


def put(key: str, report: dict) -> None:
    data = {k: v for k, v in _load().items() if time.time() - v["saved_at"] < TTL_S}  # drop stale ones
    data[key] = {"saved_at": time.time(), "report": report}
    CACHE_FILE.parent.mkdir(exist_ok=True)
    CACHE_FILE.write_text(json.dumps(data), encoding="utf-8")
