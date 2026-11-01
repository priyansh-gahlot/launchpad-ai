# Demo script and judge Q&A

## Before you go on stage

1. Start the backend **without** `--reload`:
   `cd backend` then `.venv\Scripts\python.exe -m uvicorn app.main:app --port 8100`
2. Start the frontend: `cd frontend` then `npm run dev`. Open http://localhost:5180 and check both badges are green.
3. **Warm the cache:** run one full check on your demo target 5–25 minutes before your slot (the cache lasts 30 minutes). Re-submitting it on stage is then instant.
4. Keep a second tab open with **Load demo report** already clicked, as a backup.

A live check takes about 3–4 minutes (2 TinyFish browsers at a time), so the script starts one live, shows the browsers working, then switches to the finished report.

## 60-second demo script

| Time | Do | Say |
|---|---|---|
| 0:00 | Show the empty form | "Every hackathon, people ship without knowing three things: has this been built, does it actually work, and how would a judge score it? LaunchPad answers all three in one click." |
| 0:08 | Paste idea, repo and demo URL. Click **Launch Check 🚀** (use **Run a fresh check** if the cache answers) | "It needs one API key: TinyFish." |
| 0:15 | Scroll to **Live agents** as the tiles light up | "These are real TinyFish browsers, live. One clicks the main buttons while every link is checked in seconds, one signs up with fake test data, one acts like a first-time visitor, and one reads the GitHub README. Meanwhile TinySearch and TinyFetch look for projects like mine." |
| 0:30 | Point at a tile's progress text, then open the second tab (the finished report) | "Each agent narrates what it's doing. A full run takes a few minutes, so here's the finished report from the same check." |
| 0:38 | Originality card | "Originality: it found the closest existing project, and a Competitor Scout agent visited it to see what it lacks. That's my 'how to stand out'." |
| 0:45 | Bugs list, then the scorecard ring | "Real bugs, with the agent that found each one. Then a judge scorecard out of 100." |
| 0:52 | Open **Why this score?** | "No black box: every point lost is a rule you can read, and the top 3 fixes are simply the biggest point losses." |
| 0:57 | Click **Copy report as Markdown** | "Copy, paste into Devpost, fix, ship. That's LaunchPad." |

**If anything fails on stage:** click **Load demo report** and say "This is a saved real run from earlier." Everything after 0:30 works the same.

## Likely judge questions

**1. How is this different from Lighthouse or a Playwright test suite?**
Those check what you wrote tests for, or page-level metrics. LaunchPad needs no tests: the agents get a plain-English goal like "sign up as a new user" and figure out the clicks themselves, like a real first-time user would. It also covers what those tools never do: originality and a judge-style score.

**2. Isn't the score just an AI making numbers up?**
No. The agents only report facts: this link 404s, this form had no validation, the README has no setup steps. The score comes from fixed Python rules: a high bug is −10, an unclear purpose −10, missing setup steps −5. The **Why this score?** panel lists every point lost. Same findings, same score, every time.

**3. Is it safe to point agents at a website?**
Every goal carries the same safety rules: obviously fake test data only, never pay, never delete, never contact real people, never leave the site's domain, and stop at login walls and CAPTCHAs rather than get past them. The tool is for apps you own or have permission to test, and it says so in the UI. Before spending any runs, a pre-flight check confirms the site and repo actually exist.

**4. What does TinyFish do, and what did you build?**
TinyFish does the hard part: real cloud browsers that turn a goal into clicks (TinyAgent), the live view of each browser, web search (TinySearch) and clean page text (TinyFetch). I built the orchestration and product around it:
- 5 agents across 3 stages, with Stages 1 and 2 running at the same time
- a browser-slot scheduler that fits the plan's 2-at-a-time limit, so no agent times out while it waits
- live streaming of every agent to the UI
- the originality scoring and the transparent judge rules
- the cache, the pre-flight checks and the plain-English error handling

**5. Keyword overlap for originality sounds naive. Is it accurate?**
It's deliberately simple and explainable: the score is the share of your idea's key words that existing projects already mention. It tends to be strict: our demo idea scored 1/10 because test-practice sites really are common. The Competitor Scout adds the qualitative part by visiting the closest match and listing what it lacks. With more time, I'd add embedding similarity as a second signal next to the keyword score, not instead of it.

### Backup questions

- **How long and how much?** About 3–4 minutes with 2 browsers at a time, faster on a bigger plan. 5 agent runs per check (6 with Bad Inputs), and repeats within 30 minutes are free and instant.
- **What if a site blocks bots?** The tile says "blocked" in plain English. The other stages still finish, and the scorecard notes what couldn't be checked instead of guessing.
- **Why no LLM?** I checked: TinyFish has no general text-in, text-out model endpoint. Doing the scoring with rules made it transparent, which turned out to be a feature. An optional Gemini or Groq key only rewords two sentences.
- **What's next?** Screenshots of each bug from the agent's run, a mobile-layout check once TinyFish supports viewports, and a GitHub Action that runs LaunchPad on every deploy.
