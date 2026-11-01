import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentState, JobInput, JobState, StageKey, StageStatus } from './types'

// Turn a failed POST /api/analyze into readable lines (pre-flight problems or bad form input).
async function explainError(res: Response): Promise<string> {
  try {
    const { detail } = await res.json()
    if (detail?.problems) return `${detail.message}:\n• ${detail.problems.join('\n• ')}`
    if (Array.isArray(detail)) return `Please check the form:\n• ${detail.map((d) => `${d.loc?.at(-1)}: ${d.msg}`).join('\n• ')}`
    return String(detail ?? res.statusText)
  } catch {
    return `Could not start the check (HTTP ${res.status}). Is the backend running?`
  }
}

const initial: JobState = {
  jobId: null,
  status: 'idle',
  stages: { originality: 'waiting', testing: 'waiting', judge: 'waiting' },
  stageText: {},
  agents: {},
  agentOrder: [],
  originality: null,
  testing: null,
  judge: null,
  error: null,
  note: null,
  input: null,
  startedAt: null,
  finishedAt: null,
}

// Applies one server event to the job state. Every event type the backend emits is handled here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function apply(state: JobState, ev: any): JobState {
  switch (ev.type) {
    case 'stage': {
      const stage = ev.stage as StageKey
      const next = { ...state, stages: { ...state.stages, [stage]: ev.status as StageStatus } }
      if (ev.status === 'failed') next.stageText = { ...state.stageText, [stage]: ev.error }
      if (ev.status === 'done') next.stageText = { ...state.stageText, [stage]: undefined }
      if (stage === 'testing' && ev.result) next.testing = ev.result
      if (stage === 'originality' && ev.result) next.originality = ev.result
      if (stage === 'judge' && ev.result) next.judge = ev.result
      return next
    }
    case 'stage_progress':
      return { ...state, stageText: { ...state.stageText, [ev.stage as StageKey]: ev.text } }
    case 'agent': {
      const agent = ev as AgentState
      const known = state.agentOrder.includes(agent.key)
      return {
        ...state,
        agents: { ...state.agents, [agent.key]: { ...state.agents[agent.key], ...agent } },
        agentOrder: known ? state.agentOrder : [...state.agentOrder, agent.key],
      }
    }
    case 'error':
      return { ...state, error: ev.message }
    case 'job': {
      // Any stage that never started this run is marked skipped.
      const stages = { ...state.stages }
      for (const k of Object.keys(stages) as StageKey[]) if (stages[k] === 'waiting') stages[k] = 'skipped'
      return { ...state, status: ev.status, stages, finishedAt: state.startedAt ? Date.now() : null }
    }
    default:
      return state
  }
}

export function useJob() {
  const [job, setJob] = useState<JobState>(initial)
  const source = useRef<EventSource | null>(null)

  const close = () => {
    source.current?.close()
    source.current = null
  }
  useEffect(() => close, [])

  // Show a finished report (cache hit or demo) through the same event path as a live run.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadReport = useCallback((report: any, note: string) => {
    close()
    let state: JobState = { ...initial, status: 'running', jobId: report.job_id ?? null, input: report.input ?? null }
    for (const agent of Object.values(report.agents ?? {})) state = apply(state, { ...(agent as object), type: 'agent' })
    for (const stage of ['originality', 'testing', 'judge'] as StageKey[]) {
      state = apply(state, report[stage]
        ? { type: 'stage', stage, status: 'done', result: report[stage] }
        : { type: 'stage', stage, status: 'failed', error: 'Not in this report' })
    }
    setJob({ ...apply(state, { type: 'job', status: 'done' }), note })
  }, [])

  const loadDemo = useCallback(async () => {
    const res = await fetch('/api/demo')
    if (!res.ok) {
      setJob({ ...initial, status: 'failed', error: 'No demo report saved yet' })
      return
    }
    loadReport(await res.json(), 'Demo mode: a saved report from a real run.')
  }, [loadReport])

  const start = useCallback(async (body: JobInput, fresh = false) => {
    close()
    setJob({ ...initial, status: 'running', input: body, note: 'Checking that your demo and repo are reachable…' })
    const res = await fetch(`/api/analyze${fresh ? '?fresh=true' : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      setJob({ ...initial, status: 'failed', input: body, error: await explainError(res) })
      return
    }
    const data = await res.json()
    if (data.cached) {
      const mins = Math.max(1, Math.round(data.age_s / 60))
      loadReport(data.report, `Instant result: this exact project was checked ${mins} min ago.`)
      return
    }
    const job_id = data.job_id
    setJob((s) => ({ ...s, jobId: job_id, note: null, startedAt: Date.now() }))

    const es = new EventSource(`/api/jobs/${job_id}/events`)
    source.current = es
    es.onmessage = (msg) => {
      const ev = JSON.parse(msg.data)
      setJob((s) => apply(s, ev))
      if (ev.type === 'job') close()
    }
    es.onerror = () => {
      // The server closes the stream when the job ends; anything else is a lost connection.
      setJob((s) => (s.status === 'running' ? { ...s, status: 'failed', error: 'Lost connection to the backend' } : s))
      close()
    }
  }, [loadReport])

  return { job, start, loadDemo }
}
