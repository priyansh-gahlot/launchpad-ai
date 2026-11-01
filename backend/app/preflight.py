"""Cheap checks before spending any agent runs.

If the demo site is down or the repo doesn't exist, we say so in a second
instead of letting five browsers fail after three minutes.
"""
import asyncio
from urllib.parse import urlparse

import httpx

TIMEOUT_S = 12
HEADERS = {"User-Agent": "Mozilla/5.0 (LaunchPad AI pre-flight check)"}


async def _check(url: str, what: str) -> str | None:
    """Return a human-readable problem, or None if the URL looks fine."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=True, headers=HEADERS) as client:
            resp = await client.get(url)
    except httpx.TimeoutException:
        return f"{what} did not respond within {TIMEOUT_S}s ({url})"
    except httpx.HTTPError as e:
        return f"{what} is unreachable ({url}): {type(e).__name__}"
    if resp.status_code == 404:
        return f"{what} returned 404 Not Found ({url})"
    if resp.status_code >= 500:
        return f"{what} returned a server error {resp.status_code} ({url})"
    # 401/403 and friends are fine here: some sites block plain HTTP clients but work in a real browser.
    return None


async def check(repo_url: str, demo_url: str) -> list[str]:
    problems = []
    if urlparse(repo_url).netloc.removeprefix("www.") != "github.com":
        problems.append(f"Repo URL should be a github.com link (got {repo_url})")
    results = await asyncio.gather(_check(demo_url, "Live demo"), _check(repo_url, "GitHub repo"))
    for problem in results:
        if problem:
            if "GitHub repo returned 404" in problem:
                problem += ". Is the repo public?"
            problems.append(problem)
    return problems
