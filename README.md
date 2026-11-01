# LaunchPad AI — Is your project ready to launch?

> Before you launch, LaunchPad checks if your idea is original, sends AI agents to test your app like real users, and judges it like a hackathon panel — in one click.

Built solo for **TinyHacks: Bounty Edition** (TinyFish).

## What it does

You give it a project idea, a GitHub repo URL and a live demo URL. It returns one report in 3 stages:

1. **Originality check** — has this already been built?
2. **Live testing** — AI browser agents use the app like real users and find bugs.
3. **Judge scorecard** — hackathon-style score plus the top 3 fixes.

**Only one API key is needed: `TINYFISH_API_KEY`.** All the scoring is done by TinyFish agents plus plain Python rules, with no LLM required.

**Try it without spending credits:** start the app and click **Load demo report**. It shows a saved real run against [the-internet.herokuapp.com](https://the-internet.herokuapp.com), a public site built for test-automation practice.

## TinyFish products used

| Product | Where | How |
|---|---|---|
| TinyAgent | All 3 stages | 5 browser agents per check (6 with the optional 🧨 Bad Inputs agent, which tries empty, very long and special-character input): Link Checker, Sign-up Flow and First Impression test the demo in parallel (Stage 2), Competitor Scout reads the closest similar project (Stage 1), and Repo Reader reviews the GitHub README (Stage 3). Each returns structured JSON. |
| Live browser view | UI | Each agent's `streaming_url` is embedded in an iframe, so you watch all the browsers work at once. |
| TinyFetch + HTTP | Stage 2 | The Link Checker splits its work. TinyFetch lists every link on the home page, and Python checks up to 40 same-site links over HTTP in about 5s (404, 5xx or no response counts as broken). The browser agent only clicks the 3 main buttons. If the clicking part times out, the link results still count and no points are lost. |
| HTTP + TinyAgent | Stage 2 (optional) | Bad Inputs: Python first finds a page with a text field over plain HTTP. It prefers search, contact and plain input pages and avoids login pages, where agents stall. The agent then starts right on that page and submits 2 test inputs. If there are no fields, no agent run is spent. For JavaScript apps, where plain HTTP can't see the forms, the agent searches for a field itself. Being optional, it's never penalised if it can't finish. |
| TinySearch | Stage 1 | 4 queries (`<idea keywords> github / devpost / product hunt / app`) run in parallel. |
| TinyFetch | Stage 1 | Reads the top 5 search results in one call for similarity scoring. |
| Mako / LLM | Not used | TinyFish has no general text-in, text-out LLM endpoint (checked the API docs and OpenAPI specs). An optional Gemini or Groq key only rewords two summary sentences. |

## How the scores are calculated

Every number comes from a rule in the code, and the UI's **"Why this score?"** panel lists every point lost.

**Originality (0–10)**, in [stages/originality.py](backend/app/stages/originality.py):
- The idea's keywords (stop words removed, lightly stemmed) are compared to each fetched page's title, snippet and text.
- Similarity is the share of the idea's keywords a page mentions. High is 50% or more, medium is 30% or more.
- Originality is `10 × (1 − best similarity)`, minus 1 for each extra high match.
- **How to stand out:** what the Competitor Scout says the closest match lacks, plus the idea keywords that no similar page mentions.

**Scorecard**, in [stages/judge.py](backend/app/stages/judge.py). There are four sub-scores from 0 to 10, and `total = sum × 2.5` (out of 100).

| Sub-score | Starts at | Points lost (out of 10) | Effect on total |
|---|---|---|---|
| Idea originality | Stage 1 score | — | — |
| Works as promised | 10 | high bug −4, broken link or button −1 each, medium bug −1, low bug −0.5, Sign-up agent couldn't finish −2 (Link Checker: −2 only if the HTTP link check also failed; the optional Bad Inputs agent is never penalised) | −10 / −2.5 / −2.5 / −1.25 / −5 |
| UI / UX | 10 | unclear purpose −4, UI issue −1, confusing thing −0.5 (UI issues capped at −4 in total), First Impression agent couldn't finish −2 | −10 / −2.5 / −1.25 / −5 |
| Docs / README | Repo Reader's 0–10 rating | no setup steps −2, no demo or screenshots −1 | −5 / −2.5 |

**Top 3 fixes** are the issues that cost the most points, biggest first.

## Setup

Requires Python 3.11+ and Node 20+.

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # then paste your TINYFISH_API_KEY into .env
uvicorn app.main:app --reload --port 8100
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5180. Vite proxies `/api` to the backend, so API keys never reach the browser.

**Check your key works** (one agent run on example.com, plus a search and a fetch):

```powershell
cd backend
.venv\Scripts\python.exe try_tinyfish.py
```

### Demo day

The 60-second script and judge Q&A are in [docs/DEMO.md](docs/DEMO.md).

- **Run the backend without `--reload`:** `uvicorn app.main:app --port 8100`. Jobs live in memory, so an auto-reload mid-check would lose the running job.
- **Instant repeats:** the same idea, repo and demo URL checked within 30 minutes comes back instantly from `backend/cache/reports.json`. **Run a fresh check** skips the cache.
- **Backup demo:** **Load demo report** shows `demo/sample_report.json`, a saved real run, if Wi-Fi or a site fails on stage. To replace it with a newer run:
  ```powershell
  curl http://127.0.0.1:8100/api/jobs/<job_id> -o ..\demo\sample_report.json
  ```
- **Timing:** a full check takes about 3–4 minutes on a plan that runs 2 agents at a time (`TINYFISH_MAX_PARALLEL=2`). Waiting agents show "Waiting for a free browser". A higher plan limit means a faster check.

## Architecture

```
Browser (React)  ──POST /api/analyze──▶  FastAPI backend  ──X-API-Key──▶  TinyFish
       ▲                                     │
       └──── SSE /api/jobs/{id}/events ◀─────┘   (status, progress, live-view URLs, results)
```

- **Stage 1 (Originality) and Stage 2 (Live Testing) run at the same time.** Stage 3's Repo Reader starts right away too, then scores once Stages 1 and 2 finish.
- **Keys stay on the server.** Only TinyFish's `streaming_url` (safe to share, per the TinyFish docs) reaches the browser.
- **One stage failing doesn't sink the report.** The scorecard uses a neutral 5/10 for the missing part and says so.
- **Browser slots:** TinyFish plans cap how many agents run at once. LaunchPad hands out slots itself (testers first, then the Repo Reader, then the Scout), and an agent's 180s timer starts only when its browser does.
- **Cost:** each full check uses 5 TinyFish agent runs (6 with Bad Inputs). Search is free up to the daily limit.

### API

| Method | Path | Does |
|---|---|---|
| `POST` | `/api/analyze?fresh=false` | Body `{idea, repo_url, demo_url, extra_agents}`. Runs the pre-flight check, then returns `{job_id}`, or `{cached: true, report}` for a repeat within 30 minutes. Returns 422 with a list of problems if the site or repo is unreachable. |
| `GET` | `/api/jobs/{id}/events` | Server-Sent Events stream: stage status, agent status, progress text, live-view URLs and results. Replays past events, so a late or refreshed browser catches up. |
| `GET` | `/api/jobs/{id}` | The full report JSON. |
| `GET` | `/api/demo` | The saved demo report. |
| `GET` | `/api/health` | Whether the TinyFish key and the optional LLM are configured (never the keys themselves). |

### Project structure

```
backend/app/
  main.py            routes, job runner (stages 1+2 in parallel, then 3)
  tinyfish.py        TinyAgent (SSE), TinySearch, TinyFetch wrapper: timeouts, 1 retry, clear errors
  agents.py          runs one agent as a live UI tile; browser-slot limiter; safety rules
  stages/
    originality.py   Stage 1: search, fetch, keyword similarity, Competitor Scout
    testing.py       Stage 2: Link Checker, Sign-up Flow, First Impression (+ Bad Inputs)
    linkcheck.py     Stage 2: fast HTTP check of every home-page link (TinyFetch + httpx)
    inputs.py        Stage 2: finds a page with a text field for the Bad Inputs agent
    judge.py         Stage 3: Repo Reader + scoring rules + top 3 fixes
  preflight.py       is the site up / does the repo exist, before spending agent runs
  cache.py           30-minute JSON file cache
  llm.py             optional Gemini/Groq rewording (not required)
  models.py          request model, in-memory job store with event replay
frontend/src/
  App.tsx            the one page
  useJob.ts          SSE client: turns server events into page state
  components/        StageCards, AgentGrid (live tiles), OriginalityCard, BugList, Scorecard
  markdown.ts        "Copy report as Markdown"
demo/sample_report.json   saved real run for demo mode
```

## Screenshots

<!-- Save these in docs/screenshots/ and uncomment. Take 1 and 2 during a live check, so the tiles show real browsers. -->
<!--
![Agents testing an app live](docs/screenshots/1-live-agents.png)
![Judge scorecard](docs/screenshots/2-scorecard.png)
![Originality check](docs/screenshots/3-originality.png)
-->

_Screenshots coming soon. Meanwhile, click **Load demo report** to see a full real run._

## Error handling

| What goes wrong | What you see |
|---|---|
| Demo site down, repo 404 or not on GitHub | Pre-flight check rejects it in about 2s with the exact reason, before any agent runs are spent, plus a "Show the demo report instead" button |
| Agent runs out of time (180s once its browser starts) | Tile turns red: **timed out**, with a hint; the scorecard says what couldn't be checked |
| Site blocks bots | Tile shows **blocked** (anti-bot protection) |
| Login wall or CAPTCHA | Agent stops as instructed; amber **login wall** tile; it never tries to get past one |
| All browsers busy | Tile shows "Waiting for a free browser (max 2 at a time)" |
| One whole stage fails | The other stages still finish; the scorecard uses 5/10 for that area and says so |

**Not built:** a mobile-viewport agent. The TinyFish Agent API has no viewport or device option, so it couldn't truly test a phone layout.

## Ethics

- Only test apps you own or have permission to test.
- Agents use obviously fake test data (Test User, `launchpad.test+…@example.com`).
- Read-only by design: no payments, no deletions, no messages to real people, no leaving the site's domain.
- Agents stop and report on login walls and CAPTCHAs instead of trying to get past them.
