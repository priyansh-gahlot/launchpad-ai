import { AlertCircle, Bot, Check, Scale, Search, Timer, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { StageKey, StageStatus } from '../types'

const STAGES: { key: StageKey; title: string; detail: string; icon: LucideIcon }[] = [
  { key: 'originality', title: 'Originality', detail: 'TinySearch + TinyFetch + Scout agent', icon: Search },
  { key: 'testing', title: 'Live testing', detail: 'TinyFish browser agents in parallel', icon: Bot },
  { key: 'judge', title: 'Judge', detail: 'Repo Reader agent + score rules', icon: Scale },
]

function useElapsed(startedAt: number | null, finishedAt: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt || finishedAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [startedAt, finishedAt])
  if (!startedAt) return null
  const s = Math.max(0, Math.floor(((finishedAt ?? now) - startedAt) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function StageCards({
  stages,
  stageText,
  startedAt,
  finishedAt,
}: {
  stages: Record<StageKey, StageStatus>
  stageText: Partial<Record<StageKey, string>>
  startedAt: number | null
  finishedAt: number | null
}) {
  const elapsed = useElapsed(startedAt, finishedAt)
  return (
    <div className="glass fade-in rounded-3xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">Progress</span>
        {elapsed && (
          <span className="font-display inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-sm text-zinc-300 tabular-nums">
            {finishedAt ? <Check size={14} className="text-emerald-400" /> : <Timer size={14} className="text-accent-300" />}
            {finishedAt ? 'Done in ' : ''}
            {elapsed}
          </span>
        )}
      </div>
      <div className="grid gap-6 md:grid-cols-3 md:gap-0">
        {STAGES.map((s, i) => {
          const status = stages[s.key]
          const prevDone = i > 0 && stages[STAGES[i - 1].key] !== 'waiting'
          return (
            <div key={s.key} className="relative flex items-start gap-4 md:flex-col md:items-center md:px-4 md:text-center">
              {/* Connector to the previous stage (desktop). */}
              {i > 0 && (
                <div
                  className="absolute top-6 hidden h-0.5 overflow-hidden rounded bg-white/10 md:block"
                  style={{ left: 'calc(-50% + 32px)', right: 'calc(50% + 32px)' }}
                >
                  <div className={`h-full bg-gradient-to-r from-brand to-accent-2 transition-all duration-700 ${prevDone ? 'w-full' : 'w-0'}`} />
                </div>
              )}
              <StageIcon status={status} icon={s.icon} />
              <div className="min-w-0 md:mt-3">
                <div className="font-display font-semibold text-white">{s.title}</div>
                <div className={`mt-0.5 text-sm ${status === 'failed' ? 'text-red-400' : status === 'running' ? 'text-accent-200' : 'text-zinc-500'}`}>
                  {status === 'skipped' ? 'Not run' : (stageText[s.key] ?? s.detail)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StageIcon({ status, icon: Icon }: { status: StageStatus; icon: LucideIcon }) {
  const base = 'relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-all duration-500'
  if (status === 'running')
    return (
      <span className={`${base} running-glow bg-brand/15 text-accent-200`}>
        <span className="absolute inset-1 animate-spin rounded-xl border-2 border-transparent border-t-brand" />
        <Icon size={20} />
      </span>
    )
  if (status === 'done')
    return (
      <span className={`${base} bg-emerald-500 text-black shadow-lg shadow-emerald-500/30`}>
        <Check size={22} strokeWidth={3} />
      </span>
    )
  if (status === 'failed')
    return (
      <span className={`${base} bg-red-500 text-black`}>
        <X size={22} strokeWidth={3} />
      </span>
    )
  return (
    <span className={`${base} border border-white/10 bg-white/[0.03] text-zinc-500`}>
      <Icon size={20} />
    </span>
  )
}

// A round status indicator for the agent tiles.
export function StatusIcon({ status }: { status: string }) {
  if (status === 'running')
    return <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-2 border-white/10 border-t-brand" />
  if (status === 'done')
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/40">
        <Check size={20} strokeWidth={2.5} />
      </span>
    )
  if (status === 'failed' || status === 'warn')
    return (
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ${
          status === 'warn' ? 'bg-amber-500/15 text-amber-300 ring-amber-500/40' : 'bg-red-500/15 text-red-400 ring-red-500/40'
        }`}
      >
        <AlertCircle size={20} />
      </span>
    )
  return <span className="h-7 w-7 shrink-0 rounded-full border-2 border-white/10" />
}
