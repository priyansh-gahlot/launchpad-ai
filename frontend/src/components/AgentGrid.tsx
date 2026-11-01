import { Lock } from 'lucide-react'
import { AgentIcon } from '../icons'
import type { AgentState, Bug } from '../types'
import { StatusIcon } from './StageCards'

const BADGE: Record<string, string> = {
  queued: 'bg-white/5 text-zinc-400 ring-white/10',
  running: 'bg-brand/15 text-accent-200 ring-brand/40',
  done: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  warn: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  failed: 'bg-red-500/10 text-red-300 ring-red-500/30',
}

const FRAME: Record<string, string> = {
  queued: 'ring-1 ring-white/8',
  running: 'running-glow',
  done: 'ring-1 ring-emerald-500/30',
  warn: 'ring-1 ring-amber-500/40',
  failed: 'ring-1 ring-red-500/40',
}

// What each agent is for, shown under its name.
const ROLE: Record<string, string> = {
  link_checker: 'Every link over HTTP + clicks the main buttons',
  signup_flow: 'Signs up with fake test data',
  first_impression: 'Acts like a first-time visitor',
  bad_inputs: 'Tries empty and special-character input',
  competitor_scout: 'Visits the closest existing project',
  repo_reader: 'Reads your GitHub README',
}

// Plain-English explanation for each way an agent can stop early.
const PROBLEMS: Record<string, { badge: string; hint: string }> = {
  timeout: { badge: 'timed out', hint: 'The agent ran out of time (180s). The flow may be slow or hard to find.' },
  queue: { badge: 'no browser', hint: 'No free TinyFish browser became available in time. Try again in a minute.' },
  site_blocked: { badge: 'blocked', hint: 'The site blocked the automated browser (anti-bot protection).' },
  login_wall: { badge: 'login wall', hint: 'Stopped at a login wall or CAPTCHA, as instructed. It never tries to get past one.' },
  failed: { badge: 'failed', hint: 'The agent could not finish this task.' },
}
const PARTIAL = { badge: 'partial', hint: 'Every link was checked; only the button clicks ran out of time. No points lost.' }

type R = Record<string, unknown>
const list = (v: unknown) => (Array.isArray(v) ? v : [])
const cut = (s: unknown, n = 140) => {
  const t = String(s ?? '')
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

type Headline = { value: string; label: string; detail?: string; good?: boolean }

// The one big number a finished tile leads with, readable from the back of the room.
// `found` = this agent's findings in the final bug list (after filtering out non-bugs), when known.
function headline(a: AgentState, found?: number): Headline {
  const r = (a.result ?? {}) as R
  const count = (raw: unknown[]) => found ?? raw.length
  switch (a.key) {
    case 'link_checker': {
      const h = a.http_check
      const broken = h?.broken?.length ?? 0
      const buttonProblems = found !== undefined ? Math.max(0, found - broken) : list(r.issues).length
      const buttons = a.status === 'done' ? `${r.checked ?? '?'} buttons clicked, ${buttonProblems} problem(s)` : 'Button clicks unfinished'
      return h?.checked !== undefined
        ? { value: String(h.checked), label: `links checked · ${broken} broken`, detail: buttons, good: broken === 0 }
        : { value: '–', label: 'link check unavailable', detail: buttons }
    }
    case 'signup_flow': {
      if (r.flow_found === false) return { value: '—', label: 'no sign-up form found' }
      const steps = list(r.steps) as R[]
      const issues = count(list(r.issues))
      return { value: `${steps.filter((s) => s.ok).length}/${steps.length}`, label: 'sign-up steps passed', detail: `${issues} issue(s) noted`, good: issues === 0 }
    }
    case 'first_impression':
      return r.clear_purpose === false
        ? { value: 'Unclear', label: 'purpose for a first-time visitor', detail: cut(r.what_it_does, 110) }
        : { value: 'Clear', label: 'purpose for a first-time visitor', detail: cut(r.what_it_does, 110), good: true }
    case 'bad_inputs':
      return r.no_inputs
        ? { value: '—', label: 'no input fields to test' }
        : { value: String(count(list(r.issues))), label: 'input problems found', good: count(list(r.issues)) === 0 }
    case 'competitor_scout':
      return { value: cut(r.name ?? 'Closest match', 28), label: 'closest existing project', detail: cut(r.what_it_does, 110) }
    case 'repo_reader':
      return {
        value: `${r.docs_readme ?? '?'}/10`,
        label: 'README score',
        detail: `${r.has_setup_steps ? '✓ setup steps' : '✗ no setup steps'} · ${r.has_demo_or_screenshots ? '✓ demo/screenshots' : '✗ no demo/screenshots'}`,
        good: Number(r.docs_readme) >= 7,
      }
    default:
      return { value: '✓', label: 'finished' }
  }
}

function shortUrl(url?: string) {
  if (!url) return 'about:blank'
  try {
    const u = new URL(url)
    return u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname)
  } catch {
    return url
  }
}

export function AgentGrid({ agents, bugs }: { agents: AgentState[]; bugs?: Bug[] }) {
  // Count each agent's findings from the final bug list, so tiles and the bug list always agree.
  const found = bugs && Object.fromEntries(agents.map((a) => [a.key, bugs.filter((b) => b.agent === a.key).length]))
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {agents.map((a, i) => (
        <AgentTile key={a.key} agent={a} delay={i * 70} found={found?.[a.key]} />
      ))}
    </div>
  )
}

function AgentTile({ agent: a, delay, found }: { agent: AgentState; delay: number; found?: number }) {
  const live = a.status === 'running' && a.streaming_url
  // Link Checker: every link was checked over HTTP, only the button clicks didn't finish.
  const partial = a.key === 'link_checker' && a.status === 'failed' && a.http_check?.checked !== undefined
  const problem = partial ? PARTIAL : a.error_kind ? PROBLEMS[a.error_kind] : null
  // A finished agent that stopped at a login wall is a warning, not a failure; so is a partial Link Checker.
  const look = (a.status === 'done' && problem) || partial ? 'warn' : a.status
  const h = a.status === 'done' || partial ? headline(a, found) : null

  return (
    <div
      className={`glass fade-in flex flex-col overflow-hidden rounded-2xl transition-shadow duration-500 ${FRAME[look]}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Browser chrome: traffic lights + address bar + status */}
      <div className="flex items-center gap-3 border-b border-white/5 bg-[#f6e4d6] px-3.5 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1 text-xs text-zinc-400">
          <Lock size={11} className="shrink-0 text-zinc-500" />
          <span className="truncate">{shortUrl(a.url)}</span>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ring-1 ${BADGE[look]}`}>
          {a.status === 'running' && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand align-middle" />}
          {problem ? problem.badge : a.status}
        </span>
      </div>

      {/* Viewport */}
      <div className="relative aspect-video bg-plum-950">
        {live ? (
          <iframe src={a.streaming_url!} title={`${a.name} live browser`} className="absolute inset-0 h-full w-full border-0" />
        ) : a.status === 'queued' ? (
          <div className="absolute inset-0 flex flex-col justify-center gap-3 p-6">
            <div className="shimmer h-3 w-2/5 rounded" />
            <div className="shimmer h-3 w-4/5 rounded" />
            <div className="shimmer h-3 w-3/5 rounded" />
            <p className="mt-2 text-xs text-zinc-500">Waiting for a free browser…</p>
          </div>
        ) : h ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <div
              className={`font-display max-w-full truncate leading-tight font-bold tracking-tight ${h.value.length > 7 ? 'text-3xl' : 'text-5xl'} ${
                h.good ? 'text-emerald-300' : look === 'warn' ? 'text-amber-200' : 'text-white'
              }`}
            >
              {h.value}
            </div>
            <div className="mt-2 text-sm font-medium text-zinc-300">{h.label}</div>
            {h.detail && <div className="mt-3 max-w-xs text-xs leading-relaxed text-zinc-500">{h.detail}</div>}
            {problem && <div className="mt-2 max-w-xs text-xs text-amber-200/70">{problem.hint}</div>}
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <StatusIcon status={a.status === 'running' ? 'running' : look} />
              {a.status === 'running' && <span className="text-sm text-zinc-400">Opening the live view…</span>}
              {problem && <span className="max-w-xs text-sm text-zinc-400">{problem.hint}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Footer: who the agent is and what it's doing */}
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-accent-300 ring-1 ring-brand/20">
          <AgentIcon agentKey={a.key} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-semibold text-white">{a.name}</span>
            {a.streaming_url && a.status === 'running' && (
              <a href={a.streaming_url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-accent-300 hover:underline">
                Open live ↗
              </a>
            )}
          </div>
          <p className={`truncate text-sm ${a.status === 'failed' && !partial ? 'text-red-300' : a.status === 'running' ? 'text-accent-100/80' : 'text-zinc-500'}`}>
            {a.status === 'running' || (a.status === 'failed' && !partial) ? a.progress : (ROLE[a.key] ?? a.progress)}
          </p>
        </div>
      </div>
    </div>
  )
}
