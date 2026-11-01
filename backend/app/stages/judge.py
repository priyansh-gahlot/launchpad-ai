"""Stage 3: Judge scorecard.

A TinyAgent ("Repo Reader") reads the GitHub repo and README. Then plain Python
rules turn every agent's findings into four 0-10 sub-scores, a 0-100 total
(sum x 2.5) and the top 3 fixes. Every point lost is listed in "breakdown",
so the score can always be explained.
"""
import asyncio
import math

from .. import llm
from ..agents import queue_tile, run_agent_tile
from ..models import Job

REPO_READER = {"key": "repo_reader", "name": "Repo Reader", "icon": "📚"}

REPO_GOAL = (
    "Read the README and repository. Read only: do not sign in, star, fork, open issues or "
    "change anything, and do not leave this repository. "
    "Return JSON: {docs_readme: number 0-10, has_setup_steps: boolean, "
    "has_demo_or_screenshots: boolean, project_summary: string, missing_things: [string]}"
)

# Points lost from a 0-10 sub-score. x2.5 gives the effect on the 0-100 total,
# e.g. a high-severity bug costs 4 points here = 10 points of the total.
PENALTY = {
    "high_bug": 4,
    "unclear_purpose": 4,
    "medium_bug": 1,
    "broken_link": 1,
    "low_bug": 0.5,
    "agent_failed": 2,
    "no_setup_steps": 2,
    "no_demo": 1,
}
UI_ISSUE_CAP = 4  # most UI/UX points that individual UI issues can cost in total

AREAS = {
    "idea_originality": "Idea originality",
    "works_as_promised": "Works as promised",
    "ui_ux": "UI / UX",
    "docs_readme": "Docs / README",
}


def compute_scorecard(originality: dict | None, testing: dict | None, repo: dict) -> dict:
    """Pure function: same inputs, same score. Easy to test and to explain."""
    breakdown = []  # [{area, points, reason}]
    fixes = []  # [(weight on 0-100 total, text)]

    def lose(area: str, points: float, reason: str, fix: str | None = None):
        breakdown.append({"area": area, "points": -points, "reason": reason})
        if fix:
            fixes.append((points * 2.5, fix))

    # --- Idea originality: straight from Stage 1.
    if originality and originality.get("originality_score") is not None:
        orig = float(originality["originality_score"])
        if orig <= 5 and originality.get("similar_projects"):
            closest = originality["similar_projects"][0]["name"]
            tips = originality.get("how_to_stand_out") or [f"make it obvious how you differ from {closest}"]
            fixes.append(((6 - orig) * 2.5, tips[0]))
    else:
        orig = 5.0
        breakdown.append({"area": "idea_originality", "points": 0, "reason": "Originality check failed; using 5/10"})

    # --- Works as promised + UI/UX: from Stage 2 bugs.
    works, ui = 10.0, 10.0
    ui_issue_pts = 0.0
    if testing is None:
        works, ui = 5.0, 5.0
        breakdown.append({"area": "works_as_promised", "points": -5, "reason": "Live testing failed; using 5/10"})
        breakdown.append({"area": "ui_ux", "points": -5, "reason": "Live testing failed; using 5/10"})
        testing = {"agents": {}, "bugs": []}
    for key, agent in testing.get("agents", {}).items():
        if agent.get("status") != "done":
            error = agent.get("error") or "unknown error"
            http = agent.get("http_check") or {}
            if key == "link_checker" and "checked" in http:
                # Only the button clicks are missing; every link was still checked over HTTP.
                breakdown.append({"area": "works_as_promised", "points": 0,
                                  "reason": f"Button check didn't finish ({error}); {http['checked']} links still checked over HTTP"})
                continue
            if key == "bad_inputs":
                # Optional extra test: if it can't finish, that says nothing bad about the site.
                breakdown.append({"area": "works_as_promised", "points": 0,
                                  "reason": f"Optional Bad Inputs test didn't finish ({error}); not scored"})
                continue
            if "timed out" in error:
                fix = f"Make key flows quicker to find: the {agent['name']} agent ran out of time"
            else:
                fix = f"Make sure the demo works for automated visitors ({agent['name']} failed: {error})"
            # The penalty goes to the area that agent was checking.
            area = "ui_ux" if key == "first_impression" else "works_as_promised"
            lose(area, PENALTY["agent_failed"], f"{agent['name']} could not finish: {error}", fix)
            if area == "ui_ux":
                ui -= PENALTY["agent_failed"]
            else:
                works -= PENALTY["agent_failed"]

    broken = [b for b in testing.get("bugs", []) if b.get("kind") == "broken_link"]
    if broken:
        pts = PENALTY["broken_link"] * len(broken)
        works -= pts
        lose("works_as_promised", pts, f"{len(broken)} broken link(s)",
             f"Fix {len(broken)} broken link(s): " + "; ".join(b["problem"] for b in broken[:3]))

    for b in testing.get("bugs", []):
        if b.get("kind") == "broken_link":
            continue
        if b.get("kind") == "unclear_purpose":
            ui -= PENALTY["unclear_purpose"]
            lose("ui_ux", PENALTY["unclear_purpose"], b["problem"],
                 "Add a clear headline on the home page that says what the app does and who it's for")
            continue
        sev = b.get("severity", "medium")
        pts = PENALTY.get(f"{sev}_bug", 1)
        area = "ui_ux" if b.get("agent") == "first_impression" else "works_as_promised"
        if area == "ui_ux":
            # Cap UI nitpicks so one chatty agent (often repeating itself) can't sink the score.
            pts = min(pts, UI_ISSUE_CAP - ui_issue_pts)
            ui_issue_pts += pts
            ui -= pts
        else:
            works -= pts
        reason = f"{sev} bug: {b['problem']}" + ("" if pts else " (UI issue cap reached)")
        lose(area, pts, reason, f"Fix: {b['problem']}")

    # --- Docs: from the Repo Reader agent.
    r = repo.get("result") or {}
    if repo.get("status") == "done" and isinstance(r.get("docs_readme"), (int, float)):
        docs = float(r["docs_readme"])
        breakdown.append({"area": "docs_readme", "points": 0, "reason": f"Repo Reader rated the README {docs:g}/10"})
        if r.get("has_setup_steps") is False:
            docs -= PENALTY["no_setup_steps"]
            lose("docs_readme", PENALTY["no_setup_steps"], "No setup steps in the README",
                 "Add setup steps to the README: install, environment variables, and the run command")
        if r.get("has_demo_or_screenshots") is False:
            docs -= PENALTY["no_demo"]
            lose("docs_readme", PENALTY["no_demo"], "No demo link or screenshots",
                 "Add the live demo link and a screenshot or GIF to the top of the README")
        for thing in (r.get("missing_things") or [])[:3]:
            fixes.append((1.5, f"README: add {thing}"))
    else:
        docs = 3.0
        lose("docs_readme", 7, f"Repo Reader could not read the repo: {repo.get('error')}",
             "Make the GitHub repo public with a README at the root")

    scores = {
        "idea_originality": orig,
        "works_as_promised": works,
        "ui_ux": ui,
        "docs_readme": docs,
    }
    # Round half up (Python's round() would turn 6.5 into 6).
    scores = {k: math.floor(max(0, min(10, v)) + 0.5) for k, v in scores.items()}
    total = math.floor(sum(scores.values()) * 2.5 + 0.5)

    # Biggest point loss first; skip duplicates.
    top, seen = [], set()
    for _, text in sorted(fixes, key=lambda f: -f[0]):
        if text not in seen:
            seen.add(text)
            top.append(text)
    for tip in (originality or {}).get("how_to_stand_out", []):
        if len(top) >= 3:
            break
        if tip not in seen:
            top.append(tip)

    best = max(scores, key=scores.get)
    comment = f"Strongest area: {AREAS[best]} ({scores[best]}/10). "
    comment += f"Biggest win available: {top[0][0].lower() + top[0][1:]}." if top else "No major issues found, nice work."

    return {
        "total_score": total,
        "scores": scores,
        "bugs_found": len(testing.get("bugs", [])),
        "top_3_fixes": top[:3],
        "judge_comment": comment,
        "breakdown": breakdown,
        "project_summary": r.get("project_summary"),
    }


async def run_judge(job: Job, idea: str, repo_url: str, wait_for: list[asyncio.Task]) -> dict:
    def say(text: str):
        job.emit({"type": "stage_progress", "stage": "judge", "text": text})

    # The repo doesn't depend on the other stages, so read it while they run.
    say("Reading the GitHub repo...")
    queue_tile(job, REPO_READER, "judge")
    repo = await run_agent_tile(job, REPO_READER, "judge", repo_url, REPO_GOAL)

    say("Waiting for originality and testing...")
    await asyncio.gather(*wait_for)

    say("Scoring...")
    card = compute_scorecard(job.report.get("originality"), job.report.get("testing"), repo)
    card["repo"] = repo.get("result")

    if llm.provider():
        nicer = await llm.write(
            "You are a hackathon judge. Write exactly 2 sentences: one honest strength, one most "
            f"important improvement. Be encouraging.\nIdea: {idea}\nScores (0-10): {card['scores']}\n"
            f"Total: {card['total_score']}/100\nTop fixes: {card['top_3_fixes']}"
        )
        card["judge_comment"] = nicer or card["judge_comment"]
    return card
