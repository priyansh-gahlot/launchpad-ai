"""Request model and the in-memory job store.

A Job keeps every event it has emitted. The SSE endpoint replays past events
first, then streams new ones, so a browser that connects late (or refreshes)
still sees the whole story.
"""
import asyncio
import time
import uuid
from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class AnalyzeRequest(BaseModel):
    idea: str = Field(min_length=10, max_length=2000)
    repo_url: HttpUrl
    demo_url: HttpUrl
    extra_agents: bool = False  # also run the Bad Inputs agent


class Job:
    def __init__(self, request: AnalyzeRequest):
        self.id = uuid.uuid4().hex[:12]
        self.created_at = time.time()
        self.request = request
        self.done = False
        self.task: asyncio.Task | None = None
        self.events: list[dict] = []
        self._subscribers: list[asyncio.Queue] = []
        self.report: dict[str, Any] = {
            "job_id": self.id,
            "status": "running",
            "input": request.model_dump(mode="json"),
            "originality": None,
            "testing": None,
            "judge": None,
            "agents": {},  # latest state of every agent tile, so a saved report can redraw the grid
        }

    def emit(self, event: dict) -> None:
        self.events.append(event)
        if event["type"] == "agent":
            self.report["agents"][event["key"]] = event
        for q in self._subscribers:
            q.put_nowait(event)

    def subscribe(self) -> tuple[list[dict], asyncio.Queue]:
        """Return (past events, queue of future events). No await in between, so nothing is missed."""
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers.append(q)
        return list(self.events), q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        if q in self._subscribers:
            self._subscribers.remove(q)

    def finish(self, status: str = "done") -> None:
        self.done = True
        self.report["status"] = status
        self.emit({"type": "job", "status": status})


JOBS: dict[str, Job] = {}
