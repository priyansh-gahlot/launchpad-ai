"""Find a page with a text input, so the Bad Inputs agent doesn't spend its time searching.

Plain HTTP: look at the home page, then up to 15 same-site pages it links to
(likely form pages first), and return the first with a typeable field.
"""
import asyncio
import re
from urllib.parse import urljoin

import httpx

from .linkcheck import HEADERS, same_site_links

MAX_PAGES = 15
TIMEOUT_S = 10

# A free-text field: <textarea>, or an <input> that is text/search/email/url/tel or has no type.
# (Number, date and slider fields silently ignore text, which sends agents into retry loops.)
TEXT_FIELD = re.compile(
    r"<textarea\b|<input\b(?![^>]*\btype=)[^>]*>|<input\b[^>]*\btype=[\"']?(?:text|search|email|url|tel)\b",
    re.IGNORECASE,
)
FORM = re.compile(r"<form\b", re.IGNORECASE)
HREF = re.compile(r"""<a\b[^>]*\bhref=["']([^"'#]+)""", re.IGNORECASE)
# Pages that probably have a form get checked first. Login pages are deliberately last:
# agents stall on them (our safety rules say "stop at login walls"), and there's little to break.
LIKELY_FORM = ("search", "contact", "input", "form", "subscribe", "signup", "sign-up", "register")
PASSWORD = re.compile(r"""type=["']?password""", re.IGNORECASE)


async def _get(client: httpx.AsyncClient, url: str) -> str:
    try:
        resp = await client.get(url)
        return resp.text if resp.status_code == 200 else ""
    except httpx.HTTPError:
        return ""


UNKNOWN = "unknown"  # blocked, or a JavaScript-rendered app: plain HTTP can't see its forms
# Signs the page is built by JavaScript (React/Vue/Next/Nuxt mount points, or a "needs JS" notice).
JS_APP = re.compile(r"""id=["'](?:root|app|__next|__nuxt)["']|<noscript[^>]*>[^<]*javascript""", re.IGNORECASE)


async def find_input_page(demo_url: str) -> str | None:
    """A URL with a text field, None if there is definitely none, or UNKNOWN."""
    async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=True, headers=HEADERS) as client:
        home = await _get(client, demo_url)
        if not home or JS_APP.search(home):
            return UNKNOWN
        if TEXT_FIELD.search(home) and not PASSWORD.search(home):
            return demo_url
        links = same_site_links([urljoin(demo_url, h) for h in HREF.findall(home)], demo_url)
        links.sort(key=lambda u: not any(w in u.lower() for w in LIKELY_FORM))  # stable: keeps page order otherwise
        links = links[:MAX_PAGES]
        pages = await asyncio.gather(*[_get(client, u) for u in links])
    # Best: a text field inside a form (so there's something to submit) on a page without a
    # password box. Then any non-login page with a text field. A login page only as a last resort.
    candidates = [(u, h) for u, h in [(demo_url, home), *zip(links, pages)] if TEXT_FIELD.search(h)]
    for prefer in (lambda h: FORM.search(h) and not PASSWORD.search(h), lambda h: not PASSWORD.search(h)):
        for url, html in candidates:
            if prefer(html):
                return url
    return candidates[0][0] if candidates else None
