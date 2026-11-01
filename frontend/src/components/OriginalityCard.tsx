import { ExternalLink, PartyPopper, Sparkles } from 'lucide-react'
import type { OriginalityResult } from '../types'

const SIMILARITY: Record<string, { chip: string; bar: string }> = {
  high: { chip: 'bg-red-500/10 text-red-300 ring-red-500/30', bar: '#e5484d' },
  medium: { chip: 'bg-amber-500/10 text-amber-300 ring-amber-500/30', bar: '#d99a00' },
  low: { chip: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30', bar: '#1f9d63' },
}

function host(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function OriginalityCard({ data }: { data: OriginalityResult }) {
  const score = data.originality_score
  const tone = score === null ? '#a1a1aa' : score >= 7 ? '#1f9d63' : score >= 4 ? '#d99a00' : '#e5484d'

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      {/* Score + how to stand out */}
      <div className="glass flex flex-col gap-6 rounded-3xl p-7">
        <div>
          <div className="flex items-end gap-2">
            <span className="font-display text-7xl leading-none font-bold" style={{ color: tone }}>
              {score ?? '–'}
            </span>
            <span className="mb-2 text-zinc-500">/ 10 original</span>
          </div>
          {/* 10-segment meter */}
          <div className="mt-4 flex gap-1">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className="h-2 flex-1 rounded-full transition-colors duration-700"
                style={{ background: score !== null && i < score ? tone : 'rgba(63,13,18,0.08)', transitionDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">{data.summary}</p>
        </div>

        {data.how_to_stand_out.length > 0 && (
          <div className="rounded-2xl border border-brand/20 bg-brand/[0.06] p-5">
            <h3 className="font-display mb-3 flex items-center gap-2 font-semibold text-accent-200">
              <Sparkles size={17} /> How to stand out
            </h3>
            <ul className="space-y-3">
              {data.how_to_stand_out.map((tip, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-zinc-200">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Similar projects */}
      <div className="glass rounded-3xl p-7">
        <h3 className="mb-5 text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">Closest existing projects</h3>
        {data.similar_projects.length === 0 ? (
          <p className="flex items-center gap-2 text-zinc-400">
            <PartyPopper size={18} className="text-accent-300" /> Nothing close found on the web.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.similar_projects.map((p, i) => {
              const s = p.similarity ? SIMILARITY[p.similarity] : null
              return (
                <li key={p.url} className="fade-in rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition hover:border-white/10" style={{ animationDelay: `${i * 80}ms` }}>
                  <div className="flex items-start justify-between gap-3">
                    <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 font-medium text-zinc-100 hover:text-accent-200">
                      <span className="line-clamp-1">{p.name}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-normal text-zinc-500">
                        {host(p.url)} <ExternalLink size={11} />
                      </span>
                    </a>
                    {s && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase ring-1 ${s.chip}`}>{p.similarity}</span>}
                  </div>
                  {p.score !== undefined && (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full" style={{ width: `${Math.round(p.score * 100)}%`, background: s?.bar ?? '#a1a1aa' }} />
                      </div>
                      <span className="w-20 text-right text-xs text-zinc-500 tabular-nums">{Math.round(p.score * 100)}% overlap</span>
                    </div>
                  )}
                  <p className="mt-2 text-sm text-zinc-400">{p.how_different}</p>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
