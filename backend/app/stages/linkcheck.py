"""Fast, deterministic broken-link check (part of Stage 2's Link Checker).

TinyFetch lists every link on the home page; we then request each same-site
link ourselves, 10 at a time. This covers far more links than a browser agent
can click in 3 minutes, and it can't time out as a whole.
"""
import asyncio
from urllib.parse import urldefrag, urlparse

import httpx

from .. import tinyfish

MAX_LINKS = 40
PARALLEL = 10
TIMEOUT_S = 10
# An honest bot user agent: some sites (e.g. Wikipedia) reject fake browser strings.
HEADERS = {"User-Agent": "LaunchPadAI/1.0 (pre-launch site checker; hackathon project)"}


def _site(url: str) -> str:
    return urlparse(url).netloc.removeprefix("www.").lower()


def same_site_links(links: list[str], home: str) -> list[str]:
    """Unique http(s) links on the same site, without #fragments, home page excluded."""
    out, seen = [], {urldefrag(home)[0].rstrip("/")}
    for link in links:
        url = urldefrag(link)[0]
        if urlparse(url).scheme in ("http", "https") and _site(url) == _site(home) and url.rstrip("/") not in seen:
            seen.add(url.rstrip("/"))
            out.append(url)
    return out[:MAX_LINKS]


async def _status(client: httpx.AsyncClient, gate: asyncio.Semaphore, url: str) -> dict | None:
    """Return a problem dict, or None if the link works."""
    async with gate:
        try:
            resp = await client.get(url)
        except httpx.TimeoutException:
            return {"url": url, "problem": f"no response within {TIMEOUT_S}s"}
        except httpx.HTTPError as e:
            return {"url": url, "problem": f"could not connect ({type(e).__name__})"}
    if resp.status_code in (404, 410) or resp.status_code >= 500:
        return {"url": url, "problem": f"returns HTTP {resp.status_code}"}
    return None  # 2xx/3xx are fine; 401/403 usually mean "login needed", not broken


async def check_links(demo_url: str) -> dict:
    page = await tinyfish.fetch([demo_url], purpose="List the links on this home page", links=True)
    if not page["results"]:
        raise tinyfish.TinyFishError(f"Could not read the home page: {page['errors']}")
    home = page["results"][0]
    links = same_site_links(home.get("links") or [], home.get("final_url") or demo_url)

    gate = asyncio.Semaphore(PARALLEL)
    async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=True, headers=HEADERS) as client:
        results = await asyncio.gather(*[_status(client, gate, u) for u in links])
    return {"checked": len(links), "broken": [r for r in results if r]}
