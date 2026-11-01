"""LaunchPad AI backend: FastAPI app that runs the 3-stage launch check."""
import asyncio
import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

from .models import JOBS, AnalyzeRequest, Job  # noqa: E402
from . import cache, llm, preflight  # noqa: E402
from .stages.judge import run_judge  # noqa: E402
from .stages.originality import run_originality  # noqa: E402
from .stages.testing import run_testing  # noqa: E402

DEMO_FILE = Path(__file__).resolve().parents[2] / "demo" / "sample_report.json"

app = FastAPI(title="LaunchPad AI")

# The Vite dev server runs on 5180; it's the only origin that needs to call us.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5180", "http://127.0.0.1:5180"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    # Report whether keys are configured, never the keys themselves.
    return {
        "ok": True,
        "tinyfish_key": bool(os.getenv("TINYFISH_API_KEY")),
        "llm": llm.provider(),  # optional: "gemini", "groq" or None
    }


async def run_stage(job: Job, stage: str, work) -> None:
    """Run one stage, store its result, and report failure without stopping the other stages."""
    job.emit({"type": "stage", "stage": stage, "status": "running"})
    try:
        job.report[stage] = await work
        job.emit({"type": "stage", "stage": stage, "status": "done", "result": job.report[stage]})
    except Exception as e:  # one broken stage shouldn't sink the whole report
        job.emit({"type": "stage", "stage": stage, "status": "failed", "error": str(e)})


async def run_job(job: Job) -> None:
    req = job.request
    idea, repo, demo = req.idea, str(req.repo_url), str(req.demo_url)
    try:
        # Stage 1 and Stage 2 don't depend on each other, so run them at the same time.
        originality = asyncio.create_task(run_stage(job, "originality", run_originality(job, idea, repo, demo)))
        testing = asyncio.create_task(run_stage(job, "testing", run_testing(job, demo, req.extra_agents)))
        # Stage 3 reads the repo straight away, then waits for 1 and 2 before scoring.
        await run_stage(job, "judge", run_judge(job, idea, repo, wait_for=[originality, testing]))
        await asyncio.gather(originality, testing)  # in case the judge stage failed early
        job.report["finished_at"] = time.time()
        if job.report["judge"]:  # only cache complete reports
            cache.put(cache.make_key(idea, repo, demo, req.extra_agents), job.report)
        job.finish("done")
    except Exception as e:  # never leave the UI spinning forever
        job.emit({"type": "error", "message": str(e)})
        job.finish("failed")


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest, fresh: bool = False):
    # Same project checked in the last 30 minutes? Return that report instantly.
    key = cache.make_key(req.idea, str(req.repo_url), str(req.demo_url), req.extra_agents)
    hit = None if fresh else cache.get(key)
    if hit:
        report, age_s = hit
        return {"cached": True, "age_s": age_s, "report": report}

    # Site down or repo missing? Say so now instead of after 5 failed agent runs.
    problems = await preflight.check(str(req.repo_url), str(req.demo_url))
    if problems:
        raise HTTPException(422, {"message": "Can't start the check", "problems": problems})

    job = Job(req)
    JOBS[job.id] = job
    job.task = asyncio.create_task(run_job(job))  # keep a reference so it isn't garbage-collected
    return {"job_id": job.id}


@app.get("/api/demo")
def demo():
    """Backup demo mode: a saved report from a real run, for when Wi-Fi or a site fails on stage."""
    try:
        return json.loads(DEMO_FILE.read_text(encoding="utf-8"))
    except OSError:
        raise HTTPException(404, "No demo report saved yet (demo/sample_report.json)")


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job.report


@app.get("/api/jobs/{job_id}/events")
async def job_events(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    async def stream():
        past, queue = job.subscribe()
        try:
            for event in past:
                yield f"data: {json.dumps(event)}\n\n"
            if job.done:
                return
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"  # stops proxies closing an idle stream
                    continue
                yield f"data: {json.dumps(event)}\n\n"
                if event["type"] == "job":
                    return
        finally:
            job.unsubscribe(queue)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
