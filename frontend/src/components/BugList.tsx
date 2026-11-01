import { PartyPopper } from 'lucide-react'
import { useState } from 'react'
import { AgentIcon } from '../icons'
import type { AgentState, Bug, Severity } from '../types'

const SEVERITY: Record<Severity, { label: string; chip: string; stripe: string; on: string }> = {
  high: { label: 'High', chip: 'text-red-300', stripe: 'bg-red-500', on: 'bg-red-500/15 ring-red-500/40 text-red-200' },
  medium: { label: 'Medium', chip: 'text-amber-300', stripe: 'bg-amber-400', on: 'bg-amber-500/15 ring-amber-500/40 text-amber-200' },
  low: { label: 'Low', chip: 'text-sky-300', stripe: 'bg-sky-400', on: 'bg-sky-500/15 ring-sky-500/40 text-sky-200' },
}
const ORDER: Severity[] = ['high', 'medium', 'low']

export function BugList({ bugs, agents }: { bugs: Bug[]; agents: Record<string, AgentState> }) {
  const [shown, setShown] = useState<Record<Severity, boolean>>({ high: true, medium: true, low: true })

  if (bugs.length === 0)
    return (
      <div className="glass rounded-3xl p-10 text-center">
        <PartyPopper size={40} className="mx-auto text-accent-300" />
        <p className="font-display mt-3 text-xl font-semibold text-white">No bugs found</p>
        <p className="mt-1 text-sm text-zinc-500">The agents couldn't break anything this time.</p>
      </div>
    )

  const counts = Object.fromEntries(ORDER.map((s) => [s, bugs.filter((b) => b.severity === s).length])) as Record<Severity, number>
  const visible = bugs.filter((b) => shown[(b.severity as Severity) ?? 'low'] ?? true)

  return (
    <div className="glass overflow-hidden rounded-3xl">
      {/* Severity filter chips */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-6 py-4">
        <span className="mr-2 text-xs text-zinc-500">Filter</span>
        {ORDER.map((s) => (
          <button
            key={s}
            onClick={() => setShown((v) => ({ ...v, [s]: !v[s] }))}
            className={`rounded-full px-3 py-1 text-sm ring-1 transition ${shown[s] ? SEVERITY[s].on : 'bg-transparent text-zinc-500 ring-white/10'}`}
          >
            <span className="font-semibold tabular-nums">{counts[s]}</span> {SEVERITY[s].label}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-white/5">
        {visible.map((b, i) => {
          const sev = SEVERITY[b.severity as Severity] ?? SEVERITY.low
          const agent = agents[b.agent]
          return (
            <li key={i} className="relative flex items-start gap-4 px-6 py-4 transition hover:bg-white/[0.02]">
              <span className={`absolute top-0 bottom-0 left-0 w-1 ${sev.stripe}`} />
              <span className={`mt-0.5 w-16 shrink-0 text-xs font-bold tracking-wider uppercase ${sev.chip}`}>{sev.label}</span>
              <div className="min-w-0 flex-1">
                <p className="leading-relaxed text-zinc-200">{b.problem}</p>
                {b.where && <p className="mt-1 truncate text-xs text-zinc-500">{b.where}</p>}
              </div>
              <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-400 sm:inline-flex">
                <AgentIcon agentKey={b.agent} size={13} /> {agent?.name ?? b.agent}
              </span>
            </li>
          )
        })}
        {visible.length === 0 && <li className="px-6 py-6 text-sm text-zinc-500">All severities are filtered out.</li>}
      </ul>
    </div>
  )
}
