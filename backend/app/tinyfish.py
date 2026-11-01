"""Thin async wrapper around the three TinyFish APIs we use.

- run_agent_stream(url, goal): TinyAgent over SSE, yields events as they arrive
- search(query): TinySearch, returns ranked results
- fetch(urls): TinyFetch, returns clean page content

All three share one API key, sent as the X-API-Key header.
Docs: https://docs.tinyfish.ai/agent-api/reference.md
"""
import asyncio
import json
import os
import time
from typing import Any, AsyncIterator

import httpx

AGENT_URL = "https://agent.tinyfish.ai/v1/automation/run-sse"
RUNS_URL = "https://agent.tinyfish.ai/v1/runs"
SEARCH_URL = "https://api.search.tinyfish.ai"
FETCH_URL = "https://api.fetch.tinyfish.ai"

AGENT_TIMEOUT_S = 180  # once the browser is running
QUEUE_TIMEOUT_S = 300  # runs above the account's concurrency limit wait (PENDING) before starting
SEARCH_TIMEOUT_S = 15
FETCH_TIMEOUT_S = 150  # docs: backend gives up at 110s per URL, CDN at 120s
RETRIES = 1


class TinyFishError(Exception):
    pass


def _headers() -> dict[str, str]:
    key = os.getenv("TINYFISH_API_KEY")
    if not key:
        raise TinyFishError("TINYFISH_API_KEY is not set. Add it to backend/.env")
    return {"X-API-Key": key}


def _explain(resp: httpx.Response) -> str:
    """Turn an HTTP error into a message a human can act on."""
    try:
        detail = resp.json().get("error", {}).get("message", "")
    except ValueError:
        detail = resp.text[:200]
    hints = {
        401: "TinyFish rejected the API key. Check TINYFISH_API_KEY in backend/.env",
        402: "TinyFish wallet is out of credit",
        403: "TinyFish refused this request (feature not enabled for this key)",
        429: "TinyFish rate limit hit, slow down",
    }
    return f"{hints.get(resp.status_code, f'TinyFish error {resp.status_code}')}: {detail}".strip(": ")


def _retryable(resp: httpx.Response) -> bool:
    return resp.status_code == 429 or resp.status_code >= 500


async def _request(method: str, url: str, timeout: float, **kwargs) -> dict:
    """One HTTP call with a single retry on network errors, 429 and 5xx."""
    last_error = "unknown error"
    for attempt in range(RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.request(method, url, headers=_headers(), **kwargs)
            if resp.is_success:
                return resp.json()
            last_error = _explain(resp)
            if not _retryable(resp):
                break
        except httpx.TimeoutException:
            last_error = f"TinyFish did not answer within {timeout:.0f}s"
        except httpx.TransportError as e:
            last_error = f"Could not reach TinyFish: {e}"
        if attempt < RETRIES:
            await asyncio.sleep(2)
    raise TinyFishError(last_error)


async def search(query: str, purpose: str | None = None) -> list[dict]:
    """Web search. Each result has: position, title, url, snippet, site_name."""
    params = {"query": query}
    if purpose:
        params["purpose"] = purpose
    data = await _request("GET", SEARCH_URL, SEARCH_TIMEOUT_S, params=params)
    return data.get("results", [])


async def fetch(urls: list[str], purpose: str | None = None, links: bool = False) -> dict:
    """Fetch up to 10 URLs as markdown.

    Returns {"results": [{url, final_url, title, text, links?, ...}], "errors": [{url, error}]}.
    With links=True each result also lists every <a href> on the page as absolute URLs.
    One bad URL does not fail the others.
    """
    body: dict[str, Any] = {"urls": urls[:10], "format": "markdown", "links": links}
    if purpose:
        body["purpose"] = purpose
    data = await _request("POST", FETCH_URL, FETCH_TIMEOUT_S, json=body)
    return {"results": data.get("results", []), "errors": data.get("errors", [])}


async def get_run(run_id: str, screenshots: str = "base64") -> dict:
    """Full run record, including steps. screenshots: url | base64 | none."""
    return await _request("GET", f"{RUNS_URL}/{run_id}", 30, params={"screenshots": screenshots})


async def cancel_run(run_id: str) -> None:
    try:
        await _request("POST", f"{RUNS_URL}/{run_id}/cancel", 15)
    except TinyFishError:
        pass  # best effort: the run may already be finished


def _failed(message: str, run_id: str | None = None) -> dict:
    return {"type": "COMPLETE", "run_id": run_id, "status": "FAILED", "result": None,
            "error": {"message": message}}


async def run_agent_stream(
    url: str, goal: str, output_schema: dict | None = None
) -> AsyncIterator[dict]:
    """Run one browser agent and yield its SSE events as dicts.

    Event types: STARTED, STREAMING_URL, PROGRESS, HEARTBEAT, COMPLETE.
    This generator ALWAYS ends with a COMPLETE event, even on network errors
    or timeouts (status "FAILED" plus error.message), so callers only need
    one code path.
    """
    body: dict[str, Any] = {
        "url": url,
        "goal": goal,
        # Server-side stop a little before our own deadline.
        "agent_config": {"max_duration_seconds": AGENT_TIMEOUT_S - 10},
    }
    if output_schema:
        body["output_schema"] = output_schema

    # The agent's 180s only starts when its browser does (STREAMING_URL); before that it may be queued.
    deadline = time.monotonic() + QUEUE_TIMEOUT_S
    browser_started = False
    run_id = None

    for attempt in range(RETRIES + 1):
        retry_reason = None
        try:
            # read=60: TinyFish sends HEARTBEAT events, so 60s of silence means trouble.
            timeout = httpx.Timeout(30, read=60)
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", AGENT_URL, headers=_headers(), json=body) as resp:
                    if not resp.is_success:
                        await resp.aread()
                        if _retryable(resp) and attempt < RETRIES:
                            retry_reason = _explain(resp)
                        else:
                            yield _failed(_explain(resp))
                            return
                    else:
                        async for line in resp.aiter_lines():
                            if time.monotonic() > deadline:
                                if run_id:
                                    await cancel_run(run_id)
                                if browser_started:
                                    yield _failed(f"Agent timed out after {AGENT_TIMEOUT_S}s", run_id)
                                else:
                                    yield _failed("Waited too long for a free TinyFish browser", run_id)
                                return
                            if not line.startswith("data:"):
                                continue
                            try:
                                event = json.loads(line[5:].strip())
                            except ValueError:
                                continue
                            run_id = event.get("run_id") or run_id
                            if event.get("type") == "STREAMING_URL" and not browser_started:
                                browser_started = True
                                deadline = time.monotonic() + AGENT_TIMEOUT_S
                            yield event
                            if event.get("type") == "COMPLETE":
                                return
                        # Stream closed without COMPLETE.
                        yield _failed("TinyFish closed the stream before the run finished", run_id)
                        return
        except (httpx.TimeoutException, httpx.TransportError) as e:
            # Only retry if the run never started; otherwise we'd pay for it twice.
            if run_id is None and attempt < RETRIES:
                retry_reason = str(e)
            else:
                if run_id:
                    await cancel_run(run_id)
                yield _failed(f"Lost connection to TinyFish: {e or type(e).__name__}", run_id)
                return

        if retry_reason:
            await asyncio.sleep(2)
