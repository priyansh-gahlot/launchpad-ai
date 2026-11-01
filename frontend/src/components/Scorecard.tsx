import { BookOpen, Lightbulb, Palette, Settings2, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { JudgeResult, ScoreArea } from '../types'

const AREAS: { key: ScoreArea; label: string; icon: LucideIcon }[] = [
  { key: 'idea_originality', label: 'Idea originality', icon: Lightbulb },
  { key: 'works_as_promised', label: 'Works as promised', icon: Settings2 },
  { key: 'ui_ux', label: 'UI / UX', icon: Palette },
  { key: 'docs_readme', label: 'Docs / README', icon: BookOpen },
]

function color(score: number, max: number) {
  const pct = score / max
  return pct >= 0.75 ? '#1f9d63' : pct >= 0.5 ? '#d99a00' : '#e5484d'
}

function verdict(total: number) {
  if (total >= 80) return { label: 'Launch-ready', sub: 'Ship it. Polish the small stuff on the way.', tone: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/30' }
  if (total >= 60) return { label: 'Almost there', sub: 'A few fixes away from a strong launch.', tone: 'text-accent-200 bg-brand/10 ring-brand/30' }
  if (total >= 40) return { label: 'Needs work', sub: 'Fix the top 3 below before you show it off.', tone: 'text-amber-200 bg-amber-500/10 ring-amber-500/30' }
  return { label: 'Not ready yet', sub: 'Start with the top 3 fixes below.', tone: 'text-red-200 bg-red-500/10 ring-red-500/30' }
}

// Counts from 0 up to the target once, for a little drama on the big number.
function useCountUp(target: number, ms = 1400) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return value
}

// Grows from 0 after mount so the bars and ring animate in.
function useMounted() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 60)
    return () => clearTimeout(t)
  }, [])
  return on
}

function ScoreRing({ score }: { score: number }) {
  const shown = useCountUp(score)
  const on = useMounted()
  const r = 78
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 200 200" className="h-56 w-56 drop-shadow-[0_0_30px_rgba(215,38,56,0.22)]">
      <defs>
        <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff9aa4" />
          <stop offset="100%" stopColor={color(score, 100)} />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(63,13,18,0.08)" strokeWidth="14" />
      <circle
        cx="100"
        cy="100"
        r={r}
        fill="none"
        stroke="url(#ring)"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={on ? c * (1 - score / 100) : c}
        transform="rotate(-90 100 100)"
        style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(.2,.8,.2,1)' }}
      />
      <text x="100" y="98" textAnchor="middle" className="fill-white font-display text-6xl font-bold" style={{ fontFamily: 'Space Grotesk' }}>
        {shown}
      </text>
      <text x="100" y="128" textAnchor="middle" className="fill-zinc-500 text-sm">
        out of 100
      </text>
    </svg>
  )
}

export function Scorecard({ data }: { data: JudgeResult }) {
  const on = useMounted()
  const v = verdict(data.total_score)
  return (
    <div className="glass relative overflow-hidden rounded-3xl">
      <div className="pointer-events-none absolute -top-32 -left-24 h-80 w-80 rounded-full bg-brand/15 blur-3xl" />

      <div className="relative grid gap-10 p-8 lg:grid-cols-[auto_1fr] lg:p-10">
        <div className="flex flex-col items-center text-center">
          <ScoreRing score={data.total_score} />
          <span className={`font-display mt-2 rounded-full px-4 py-1.5 text-sm font-semibold ring-1 ${v.tone}`}>{v.label}</span>
          <p className="mt-2 max-w-[15rem] text-sm text-zinc-400">{v.sub}</p>
          <p className="mt-3 text-xs text-zinc-500">{data.bugs_found} bugs found by live agents</p>
        </div>

        <div className="flex flex-col justify-center gap-5">
          {AREAS.map((a, i) => (
            <div key={a.key}>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2.5 text-zinc-200">
                  <a.icon size={17} className="text-accent-300" />
                  {a.label}
                </span>
                <span className="font-display text-lg font-semibold tabular-nums text-white">
                  {data.scores[a.key]}
                  <span className="text-sm text-zinc-500">/10</span>
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: on ? `${data.scores[a.key] * 10}%` : '0%',
                    background: `linear-gradient(90deg, ${color(data.scores[a.key], 10)}aa, ${color(data.scores[a.key], 10)})`,
                    transition: `width 1.1s cubic-bezier(.2,.8,.2,1) ${200 + i * 120}ms`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative border-t border-white/5 px-8 py-7 lg:px-10">
        <blockquote className="font-display text-xl leading-snug text-zinc-100">
          <span className="mr-1 text-3xl leading-none text-brand">“</span>
          {data.judge_comment}
        </blockquote>
      </div>

      {data.top_3_fixes.length > 0 && (
        <div className="relative border-t border-white/5 px-8 py-7 lg:px-10">
          <h3 className="mb-4 text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">Top 3 fixes · biggest point gains first</h3>
          <div className="grid gap-4 md:grid-cols-3">
            {data.top_3_fixes.map((fix, i) => (
              <div key={i} className="fade-in rounded-2xl border border-white/5 bg-white/[0.03] p-5" style={{ animationDelay: `${300 + i * 120}ms` }}>
                <span className="btn-glow font-display grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-snow">{i + 1}</span>
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-200">{fix}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.breakdown.length > 0 && (
        <details className="group relative border-t border-white/5 px-8 py-5 text-sm lg:px-10">
          <summary className="cursor-pointer list-none text-zinc-400 transition hover:text-white">
            <span className="mr-2 inline-block transition group-open:rotate-90">▸</span>
            Why this score? Every point lost, by rule
          </summary>
          <ul className="mt-4 space-y-2">
            {data.breakdown.map((b, i) => (
              <li key={i} className="flex gap-3 text-zinc-400">
                <span className={`w-12 shrink-0 text-right font-mono ${b.points < 0 ? 'text-red-400' : 'text-zinc-600'}`}>
                  {b.points < 0 ? b.points : '·'}
                </span>
                <span className="w-36 shrink-0 text-zinc-500">{AREAS.find((a) => a.key === b.area)?.label}</span>
                <span>{b.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
