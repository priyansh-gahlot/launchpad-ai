import { Bug, Bot, Gauge, Globe, Timer } from 'lucide-react'
import type { JobState } from '../types'

function host(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

function duration(job: JobState) {
  if (!job.startedAt || !job.finishedAt) return null
  const s = Math.round((job.finishedAt - job.startedAt) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The banner at the top of the results: what was checked and the headline numbers. */
export function ReportHeader({ job }: { job: JobState }) {
  const agents = Object.values(job.agents)
  const done = agents.filter((a) => a.status === 'done' || a.http_check?.checked !== undefined).length
  const time = duration(job)
  const chips = [
    job.judge && { icon: Gauge, text: `${job.judge.total_score}/100`, strong: true },
    job.testing && { icon: Bug, text: `${job.testing.bugs.length} findings` },
    agents.length > 0 && { icon: Bot, text: `${done}/${agents.length} agents finished` },
    time && { icon: Timer, text: `${time} total` },
  ].filter(Boolean) as { icon: typeof Bug; text: string; strong?: boolean }[]

  return (
    <div className="glass fade-in relative overflow-hidden rounded-3xl px-6 py-5 sm:px-8">
      <div className="pointer-events-none absolute -top-20 right-0 h-48 w-96 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/5 text-accent-300 ring-1 ring-white/10">
            <Globe size={22} />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
              {job.status === 'running' ? 'Checking now' : 'Launch report'}
            </div>
            <div className="font-display truncate text-2xl font-bold text-white">{host(job.input!.demo_url)}</div>
            <div className="truncate text-sm text-zinc-500">{job.input!.idea}</div>
          </div>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map(({ icon: Icon, text, strong }) => (
              <span
                key={text}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm ring-1 ${
                  strong ? 'btn-glow font-semibold text-snow ring-transparent' : 'bg-white/5 text-zinc-200 ring-white/10'
                }`}
              >
                <Icon size={15} />
                {text}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
