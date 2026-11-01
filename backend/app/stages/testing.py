"""Stage 2: Live testing. Several TinyFish agents use the demo app at once.

Each agent gets one plain-English goal plus the same safety rules, and returns
JSON. We stream its status, progress text and live-view URL to the UI, then
turn every agent's findings into one flat list of bugs.
"""
import asyncio
import random

from ..agents import SAFETY_RULES, is_overlay_noise, queue_tile, run_agent_tile
from ..models import Job
from .inputs import UNKNOWN, find_input_page
from .linkcheck import check_links

AGENTS = [
    {
        "key": "link_checker",
        "name": "Link Checker",
        "icon": "🔗",
        # Plain links are checked over HTTP in linkcheck.py (fast, all of them); the browser
        # agent only does what needs a browser: clicking the main buttons.
        "goal": (
            "On the home page, find the 3 most important buttons or calls to action (for example "
            "Get started, Sign up, Try it, Search, main menu toggles); if the page has no real "
            "buttons, use its first 3 main links instead and don't search further. Click ONLY those 3, going "
            "back to the home page in between, and note if any does nothing, shows an error, or "
            "leads to a broken page. Only list buttons that are actually broken in issues; if all "
            "3 work, return issues: []. After the 3rd, stop immediately and return the JSON. "
            "Return JSON: {checked: number, issues: [{element, problem, page_url}], blocked_by: string|null}"
        ),
    },
    {
        "key": "signup_flow",
        "name": "Sign-up Flow",
        "icon": "📝",
        "goal": (
            "Find the sign up / get started / main form and complete it with the test data. "
            "Look at no more than 3 pages to find it; if there is none, return flow_found: false. "
            "Fill in only the required fields, submit once, and return the JSON. "
            "Report every step and whether it succeeded. Only list real problems with the website "
            "as issues (errors, broken or missing validation, confusing steps, no confirmation); "
            "optional fields you chose to skip are not issues. "
            "Return JSON: {flow_found: boolean, steps: [{step, ok: boolean, note}], "
            "issues: [{problem, severity: 'high'|'medium'|'low'}], blocked_by: string|null}"
        ),
    },
    {
        "key": "first_impression",
        "name": "First Impression",
        "icon": "👀",
        "goal": (
            "Act like a first-time visitor. In under 60 seconds, can you tell what this app does "
            "and how to use it? Look around the home page but do not fill in any forms. "
            "Return JSON: {clear_purpose: boolean, what_it_does: string, "
            "confusing_things: [string], ui_issues: [string], blocked_by: string|null}"
        ),
    },
]


# Opt-in (the "extra agent" checkbox): adds about a minute on a 2-at-a-time plan.
# A mobile-viewport agent isn't offered: the TinyFish Agent API has no viewport option.
# Two quick submits: typing a 300-character string key by key could stall an agent for minutes.
BAD_INPUTS_TESTS = (
    "Work fast: type each input once, submit it once (click the submit button, or press Enter if "
    "there is none) and look at what happens. Never retry an input, never extract or read the "
    "page HTML. Try exactly 2 inputs: (1) leave it empty, (2) the text "
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<b>'\"+ 😀</b>. "
    "Then stop immediately and return the JSON. In the JSON, name the inputs 'empty' and "
    "'special'; never copy the test text itself into the JSON. Only list inputs that caused a "
    "real problem (error page, crash, broken layout, raw HTML shown, no validation at all); if "
    "the site handled an input well, leave it out. "
    "Return JSON: {issues: [{field, input, result, severity: 'high'|'medium'|'low'}], blocked_by: string|null}"
)
BAD_INPUTS = {
    "key": "bad_inputs",
    "name": "Bad Inputs",
    "icon": "🧨",
    # Normal case: inputs.py already found a page with a text field, so start right on it.
    "goal": "Use the first visible text field on THIS page; do not navigate anywhere else. " + BAD_INPUTS_TESTS,
}
NOT_BROKEN = ("no issue", "not broken", "works correctly", "working as expected", "works as expected", "loads correctly")
HANDLED_WELL = ("expected behavior", "expected behaviour", "as expected", "gracefully", "no crash", "works correctly")

# Fallback when plain HTTP can't see the forms (JavaScript apps, or the site blocks simple clients).
BAD_INPUTS_SEARCH_GOAL = "Find ONE text field reachable from this page within 2 clicks. " + BAD_INPUTS_TESTS


async def run_bad_inputs(job: Job, demo_url: str) -> dict:
    queue_tile(job, BAD_INPUTS, "testing")
    page = await find_input_page(demo_url)
    if page is None:
        # The site has no typeable fields at all: nothing to test, no agent run spent.
        state = {**{k: BAD_INPUTS[k] for k in ("key", "name", "icon")}, "stage": "testing", "status": "done",
                 "progress": "No input fields on the site: nothing to test", "streaming_url": None,
                 "url": demo_url, "run_id": None, "result": {"issues": [], "no_inputs": True},
                 "error": None, "error_kind": None}
        job.emit({"type": "agent", **state})
        return state
    if page == UNKNOWN:
        return await run_agent_tile(job, BAD_INPUTS, "testing", demo_url,
                                    build_goal({**BAD_INPUTS, "goal": BAD_INPUTS_SEARCH_GOAL}))
    return await run_agent_tile(job, BAD_INPUTS, "testing", page, build_goal(BAD_INPUTS))


def build_goal(agent: dict) -> str:
    tag = random.randint(1000, 9999)
    return f"{agent['goal']}\n\n{SAFETY_RULES.format(tag=tag)}"


def to_bugs(key: str, r: dict) -> list[dict]:
    """Turn one agent's result into bugs: {agent, severity, problem, where, kind}."""
    bugs = []

    def add(severity, problem, where="", kind="other"):
        if is_overlay_noise(problem):
            return
        bugs.append({"agent": key, "severity": severity, "problem": problem, "where": where, "kind": kind})

    if r.get("blocked_by"):
        add("medium", f"Agent was blocked: {r['blocked_by']}", kind="blocked")

    if key == "link_checker":
        for i in r.get("issues") or []:
            # Agents sometimes list working buttons anyway ("No issue - ...", "not broken, but
            # navigates off-site"); those aren't bugs.
            problem = str(i.get("problem", "")).lower()
            if problem.startswith(("none", "works")) or any(p in problem for p in NOT_BROKEN):
                continue
            add("medium", f"{i.get('element', 'Button')}: {i.get('problem', 'does not work')}",
                i.get("page_url", ""), kind="broken_link")
    elif key == "signup_flow":
        if r.get("flow_found") is False:
            add("low", "No sign-up or main form found for a new user", kind="no_form")
        for i in r.get("issues") or []:
            add(i.get("severity", "medium"), i.get("problem", ""))
    elif key == "first_impression":
        if r.get("clear_purpose") is False:
            add("high", "A first-time visitor could not tell what the app does", kind="unclear_purpose")
        for text in r.get("ui_issues") or []:
            add("medium", text, kind="ui")
        for text in r.get("confusing_things") or []:
            add("low", text, kind="ui")
    elif key == "bad_inputs":
        for i in r.get("issues") or []:
            # The agent sometimes reports inputs the site handled well; those aren't bugs.
            if any(p in str(i.get("result", "")).lower() for p in HANDLED_WELL):
                continue
            add(i.get("severity", "medium"),
                f"{i.get('field', 'Input')}: entering {i.get('input', '?')!r} → {i.get('result', 'problem')}")
    return bugs


async def run_testing(job: Job, demo_url: str, extra_agents: bool = False) -> dict:
    # Show every tile as queued straight away, before any browser starts.
    for a in AGENTS:
        queue_tile(job, a, "testing")

    # The HTTP link check needs no browser slot, so it runs alongside the agents.
    http_task = asyncio.create_task(check_links(demo_url))
    work = [run_agent_tile(job, a, "testing", demo_url, build_goal(a)) for a in AGENTS]
    if extra_agents:
        work.append(run_bad_inputs(job, demo_url))
    results = await asyncio.gather(*work)

    bugs = []
    for state in results:
        if state["status"] == "done":
            bugs += to_bugs(state["key"], state["result"])

    # Attach the HTTP results to the Link Checker tile. They count even if its browser part timed out.
    link_tile = next(s for s in results if s["key"] == "link_checker")
    try:
        link_tile["http_check"] = await http_task
        for b in link_tile["http_check"]["broken"]:
            bugs.append({"agent": "link_checker", "severity": "medium", "problem": f"Broken link: {b['problem']}",
                         "where": b["url"], "kind": "broken_link"})
    except Exception as e:  # the browser part still stands on its own
        link_tile["http_check"] = {"error": str(e)}
    job.emit({"type": "agent", **link_tile})
    order = {"high": 0, "medium": 1, "low": 2}
    bugs.sort(key=lambda b: order.get(b["severity"], 3))

    return {"agents": {s["key"]: s for s in results}, "bugs": bugs}
