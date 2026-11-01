"""Stage 1: Originality. Has this idea already been built?

1. Build 4 search queries from the idea's keywords with simple templates.
2. TinySearch runs them in parallel; we dedupe by URL and keep the top 5.
3. TinyFetch reads those 5 pages in one call (trimmed to ~3000 chars each).
4. Python scores similarity = share of the idea's keywords each page mentions.
   originality = 10 x (1 - best similarity), minus 1 for each extra close match.
5. A TinyAgent ("Competitor Scout") visits the closest match and reports what
   it lacks; that becomes the "how to stand out" advice.
"""
import asyncio
import math
import re
from urllib.parse import urlparse

from .. import llm, tinyfish
from ..agents import queue_tile, run_agent_tile
from ..models import Job

TOP_N = 5
PAGE_CHARS = 3000
HIGH, MEDIUM = 0.5, 0.3  # keyword-overlap thresholds for similarity labels

STOPWORDS = set("""
a an the and or but if of to in on for with without from by at as is are was were be been being
it its this that these those you your yours we our they their them he she his her i me my
can could will would should may might must do does did done have has had not no yes so than
then there here what which who whom whose when where why how all any each every some such
more most other into over under about after before between through during while also just
very really like using use used uses make makes made get gets got let lets help helps want
new one two simple easy fast quick best great good better app apps application tool tools
platform website site web online based way ways thing things people user users someone
""".split())

SCOUT = {"key": "competitor_scout", "name": "Competitor Scout", "icon": "🕵️"}


def _stem(w: str) -> str:
    """Crude stemming so 'tests', 'testing' and 'test' all match."""
    for suffix in ("ing", "es", "s"):
        if w.endswith(suffix) and len(w) - len(suffix) >= 4:
            return w[: -len(suffix)]
    return w


def keywords(text: str, stem: bool = True) -> list[str]:
    """Meaningful words in order of appearance, lightly stemmed, no duplicates."""
    out = []
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        if w in STOPWORDS or (len(w) < 3 and w not in {"ai", "ar", "vr", "ml", "ui", "ux"}):
            continue
        w = _stem(w) if stem else w
        if w not in out:
            out.append(w)
    return out


def readable(stems: list[str], idea: str) -> list[str]:
    """Map stems back to the words the user actually typed, for display."""
    original = {_stem(w): w for w in keywords(idea, stem=False)}
    return [original.get(s, s) for s in stems]


def short(text: str, limit: int = 120) -> str:
    """First clause of an agent's sentence, so fixes stay one line."""
    for sep in (" (", " — ", "; "):
        text = text.split(sep)[0]
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def build_queries(idea: str) -> list[str]:
    short = " ".join(keywords(idea, stem=False)[:7]) or idea[:60]
    return [f"{short} github", f"{short} devpost", f"{short} product hunt", f"{short} app"]


def _key(url: str) -> str:
    p = urlparse(url)
    return f"{p.netloc.removeprefix('www.')}{p.path.rstrip('/')}".lower()


def pick_top(results_per_query: list[list[dict]], exclude: set[str]) -> list[dict]:
    """Dedupe by URL. Rank by how many queries found it, then by best search position."""
    seen: dict[str, dict] = {}
    for results in results_per_query:
        for r in results:
            url = r.get("url")
            # Skip our own links and bare homepages like producthunt.com/ (not a project).
            if not url or _key(url) in exclude or urlparse(url).path.strip("/") == "":
                continue
            k = _key(url)
            if k in seen:
                seen[k]["hits"] += 1
                seen[k]["best"] = min(seen[k]["best"], r.get("position", 99))
            else:
                seen[k] = {**r, "hits": 1, "best": r.get("position", 99)}
    ranked = sorted(seen.values(), key=lambda r: (-r["hits"], r["best"]))
    return ranked[:TOP_N]


def compare(idea: str, idea_kw: list[str], page_text: str) -> dict:
    page_kw = set(keywords(page_text))
    shared = [w for w in idea_kw if w in page_kw]
    unique = [w for w in idea_kw if w not in page_kw]
    sim = len(shared) / len(idea_kw) if idea_kw else 0.0
    label = "high" if sim >= HIGH else "medium" if sim >= MEDIUM else "low"
    shared_words, unique_words = readable(shared[:6], idea), readable(unique[:6], idea)
    if unique:
        diff = f"Overlaps on: {', '.join(shared_words) or 'nothing'}. Your idea also covers: {', '.join(unique_words)}."
    else:
        diff = f"Mentions every keyword of your idea: {', '.join(shared_words)}."
    return {"similarity": label, "score": round(sim, 2), "shared": shared, "how_different": diff}


def originality_score(sims: list[float]) -> int:
    if not sims:
        return 10
    best = max(sims)
    extra_close = sum(1 for s in sims if s >= HIGH) - (1 if best >= HIGH else 0)
    return max(0, min(10, math.floor(10 * (1 - best) + 0.5) - extra_close))


def scout_goal(idea: str) -> str:
    return (
        "This page is about a project similar to an idea we are evaluating. Work fast: read only "
        "this page (scroll it, but click at most 1 link). If it is a list or article, pick the "
        "first real product it describes and answer about that one from what this page says. "
        "Do not sign up, log in, buy, star, or submit anything, and do not leave this website. "
        f"Our idea: {idea[:400]}\n"
        "Return JSON: {name: string, what_it_does: string, what_it_lacks: [string] "
        "(2-4 things a user might want that it does not do), blocked_by: string|null}"
    )


def stand_out_tips(scout: dict, unique_kw: list[str]) -> list[str]:
    tips = []
    r = scout.get("result") or {}
    if scout.get("status") == "done":
        name = r.get("name") or "the closest match"
        for lack in (r.get("what_it_lacks") or [])[:2]:
            tips.append(f"Do what {name} doesn't: {short(lack)}")
    if len(unique_kw) >= 2:  # one leftover word is too thin to pitch on
        tips.append(f"Lead your pitch with what no similar project mentions: {', '.join(unique_kw[:5])}.")
    defaults = [
        "Show one end-to-end use case in the demo instead of a feature list.",
        "Name the exact user you're building for and the moment they'd use it.",
        "Add one feature none of the similar projects have and make it the centre of the demo.",
    ]
    for d in defaults:
        if len(tips) >= 3:
            break
        tips.append(d)
    return tips[:3]


async def run_originality(job: Job, idea: str, repo_url: str, demo_url: str) -> dict:
    def say(text: str):
        job.emit({"type": "stage_progress", "stage": "originality", "text": text})

    queries = build_queries(idea)
    idea_kw = keywords(idea)

    say(f"Searching the web ({len(queries)} queries)...")
    searches = await asyncio.gather(
        *[tinyfish.search(q, purpose=f"Find existing projects similar to: {idea[:300]}") for q in queries],
        return_exceptions=True,
    )
    ok = [s for s in searches if isinstance(s, list)]
    if not ok:
        raise tinyfish.TinyFishError(f"All searches failed: {searches[0]}")

    # Never list the user's own repo or demo as "already built".
    top = pick_top(ok, exclude={_key(repo_url), _key(demo_url)})
    if not top:
        return {"queries": queries, "originality_score": 10, "summary": "No similar projects found on the web.",
                "similar_projects": [], "how_to_stand_out": stand_out_tips({}, idea_kw)}

    say(f"Reading the top {len(top)} matches...")
    fetched = await tinyfish.fetch([r["url"] for r in top], purpose="Compare these projects to a new idea")
    text_by_key = {_key(p.get("url", "")): (p.get("text") or "")[:PAGE_CHARS] for p in fetched["results"]}

    projects = []
    for r in top:
        text = f"{r.get('title', '')} {r.get('snippet', '')} {text_by_key.get(_key(r['url']), '')}"
        projects.append({"name": r.get("title") or r["url"], "url": r["url"], **compare(idea, idea_kw, text)})
    projects.sort(key=lambda p: -p["score"])

    score = originality_score([p["score"] for p in projects])
    closest = projects[0]
    covered = {w for p in projects for w in p["shared"]}
    unique_kw = readable([w for w in idea_kw if w not in covered], idea)

    say(f"Scouting the closest match: {closest['name'][:40]}...")
    queue_tile(job, SCOUT, "originality")
    scout = await run_agent_tile(job, SCOUT, "originality", closest["url"], scout_goal(idea))

    n_close = sum(1 for p in projects if p["similarity"] == "high")
    summary = (
        f"Closest match: {closest['name']} ({round(closest['score'] * 100)}% keyword overlap). "
        f"{n_close} close match{'es' if n_close != 1 else ''} out of {len(projects)} checked."
    )
    if llm.provider():
        nicer = await llm.write(
            f"In one plain sentence (max 30 words), tell a hackathon builder how original their idea is. "
            f"Idea: {idea}\nOriginality score: {score}/10\nClosest existing project: {closest['name']}\n"
            f"Keyword overlap with it: {round(closest['score'] * 100)}%"
        )
        summary = nicer or summary

    return {
        "queries": queries,
        "originality_score": score,
        "summary": summary,
        "similar_projects": [{k: p[k] for k in ("name", "url", "similarity", "score", "how_different")}
                             for p in projects],
        "how_to_stand_out": stand_out_tips(scout, unique_kw),
        "scout": scout.get("result"),
    }
