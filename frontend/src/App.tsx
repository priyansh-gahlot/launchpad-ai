import {
  ArrowRight,
  Bomb,
  Bot,
  Check,
  Copy,
  GitBranch,
  Globe,
  Lightbulb,
  Rocket,
  Scale,
  Search,
  Shield,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AgentGrid } from './components/AgentGrid'
import { BugList } from './components/BugList'
import { OriginalityCard } from './components/OriginalityCard'
import { ReportHeader } from './components/ReportHeader'
import { Scorecard } from './components/Scorecard'
import { StageCards } from './components/StageCards'
import { IconTile, Logo } from './icons'
import { toMarkdown } from './markdown'
import { useJob } from './useJob'

type Health = { ok: boolean; tinyfish_key: boolean; llm: string | null }

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Search, title: 'Originality', text: 'TinySearch + TinyFetch find what already exists' },
  { icon: Bot, title: 'Live testing', text: 'Real browser agents use your app like new users' },
  { icon: Scale, title: 'Judge', text: 'A transparent score out of 100 and your top 3 fixes' },
]

const STATS = [
  { value: '6', label: 'AI browser agents' },
  { value: '3', label: 'stages in parallel' },
  { value: '~3 min', label: 'per check' },
  { value: '1', label: 'API key: TinyFish' },
]

export default function App() {
  const [idea, setIdea] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [demoUrl, setDemoUrl] = useState('')
  const [extraAgents, setExtraAgents] = useState(false)
  const [copied, setCopied] = useState(false)
  const [health, setHealth] = useState<Health | null>(null)
  const { job, start, loadDemo } = useJob()
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  // Loading the demo report fills the form too, so the presenter can show what was checked.
  useEffect(() => {
    if (job.input && !idea) {
      setIdea(job.input.idea)
      setRepoUrl(job.input.repo_url)
      setDemoUrl(job.input.demo_url)
    }
  }, [job.input]) // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToResults = () => setTimeout(() => progressRef.current?.scrollIntoView({ behavior: 'smooth' }), 150)
  const input = () => ({ idea, repo_url: repoUrl, demo_url: demoUrl, extra_agents: extraAgents })

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(input())
    scrollToResults()
  }

  function runFresh() {
    start(input(), true)
  }

  function showDemo() {
    loadDemo()
    scrollToResults()
  }

  async function copyMarkdown() {
    await navigator.clipboard.writeText(toMarkdown(job))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const running = job.status === 'running'
  const agents = job.agentOrder.map((k) => job.agents[k])

  return (
    <div className="page-bg relative flex min-h-screen flex-col overflow-x-hidden">
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[760px]" />
      {/* Drifting peach, blush and rose orbs behind the hero. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[900px] overflow-hidden">
        <div className="orb -top-24 left-[8%] h-80 w-80 bg-[#f4a587]" />
        <div className="orb top-40 right-[6%] h-96 w-96 bg-[#e86a78]" style={{ animationDelay: '-6s', opacity: 0.32 }} />
        <div className="orb top-[420px] left-[38%] h-72 w-72 bg-[#f7c6a8]" style={{ animationDelay: '-12s' }} />
      </div>

      <Header health={health} />

      {/* ---------- Hero ---------- */}
      <main className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pt-14 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div className="fade-in">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-accent-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
            TinyHacks · Built on TinyFish browser agents
          </span>
          <h1 className="font-display mt-6 text-5xl leading-[1.04] font-bold tracking-tight text-white sm:text-6xl">
            Is your project <span className="text-gradient">ready to launch?</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
            LaunchPad checks if your idea is original, sends AI agents to test your app like real users, and judges it
            like a hackathon panel. One click, one report.
          </p>

          <ol className="mt-10 space-y-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="fade-in flex items-center gap-4" style={{ animationDelay: `${150 + i * 120}ms` }}>
                <IconTile icon={s.icon} />
                <div>
                  <div className="font-display font-semibold text-white">
                    <span className="mr-2 text-brand">0{i + 1}</span>
                    {s.title}
                  </div>
                  <p className="text-sm text-zinc-400">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <dl className="mt-10 grid max-w-xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/5 bg-white/5 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="bg-ink/80 px-4 py-3.5">
                <dt className="font-display text-2xl font-bold text-white">{s.value}</dt>
                <dd className="mt-0.5 text-xs text-zinc-500">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <form onSubmit={onSubmit} className="glass fade-in relative rounded-3xl p-7 shadow-[0_24px_60px_-24px_rgba(63,13,18,0.28)] sm:p-8" style={{ animationDelay: '120ms' }}>
          <div className="absolute -inset-px -z-10 rounded-3xl bg-gradient-to-br from-brand/35 via-transparent to-transparent opacity-70 blur-xl" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold text-white">Run a launch check</h2>
              <p className="mt-1 text-sm text-zinc-500">About 3 minutes. Agents only ever use fake test data.</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/25">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live
            </span>
          </div>

          <div className="mt-6 space-y-4">
            <Field label="Project idea" icon={Lightbulb}>
              <textarea
                required
                rows={3}
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="A web app that turns lecture recordings into flashcards…"
                className={inputClass}
              />
            </Field>
            <Field label="GitHub repo" icon={GitBranch}>
              <input
                required
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/you/your-project"
                className={inputClass}
              />
            </Field>
            <Field label="Live demo" icon={Globe}>
              <input
                required
                type="url"
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                placeholder="https://your-project.vercel.app"
                className={inputClass}
              />
            </Field>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-3 text-sm transition hover:border-white/10">
              <input
                type="checkbox"
                checked={extraAgents}
                onChange={(e) => setExtraAgents(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              <IconTile icon={Bomb} size="sm" tone="neutral" />
              <span>
                <span className="font-medium text-zinc-200">Add the Bad Inputs agent</span>
                <span className="block text-xs text-zinc-500">Tries empty and special-character input on a form. Adds about a minute.</span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={running}
            className="btn-glow font-display mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-lg font-semibold text-snow transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60"
          >
            {running ? (
              <>
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-snow/30 border-t-snow" /> Checking your project…
              </>
            ) : (
              <>
                <Rocket size={20} strokeWidth={2.4} /> Launch Check
              </>
            )}
          </button>
          <p className="mt-4 text-center text-sm text-zinc-500">
            or{' '}
            <button type="button" onClick={showDemo} disabled={running} className="font-medium text-accent-300 underline-offset-4 hover:underline disabled:opacity-50">
              load the demo report
            </button>{' '}
            from a real run
          </p>
        </form>
      </main>

      {/* ---------- Results ---------- */}
      {job.status !== 'idle' && (
        <section ref={progressRef} className="relative mx-auto w-full max-w-6xl flex-1 scroll-mt-20 space-y-14 px-6 pb-24">
          {job.input && !(job.error && !job.jobId) && <ReportHeader job={job} />}

          {job.note && (
            <div className="glass fade-in flex flex-wrap items-center gap-3 rounded-2xl px-5 py-3.5 text-sm text-zinc-200">
              <IconTile icon={Zap} size="sm" />
              <span>{job.note}</span>
              {job.note.startsWith('Instant') && (
                <button onClick={runFresh} className="ml-auto rounded-lg border border-white/10 px-3 py-1.5 text-accent-300 transition hover:border-brand/50">
                  Run a fresh check
                </button>
              )}
            </div>
          )}

          {/* A pre-flight failure never started any stage, so don't show empty stage cards. */}
          {!(job.error && !job.jobId) && (
            <StageCards stages={job.stages} stageText={job.stageText} startedAt={job.startedAt} finishedAt={job.finishedAt} />
          )}

          {job.error && (
            <div className="fade-in flex gap-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-200">
              <TriangleAlert className="mt-0.5 shrink-0 text-red-400" size={22} />
              <div>
                <p className="font-display mb-1 font-semibold text-red-100">Couldn't run the check</p>
                <p className="whitespace-pre-line text-sm">{job.error}</p>
                <button onClick={loadDemo} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-300 underline-offset-4 hover:underline">
                  Show the demo report instead <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {job.judge && (
            <div className="fade-in">
              <SectionTitle
                eyebrow="Stage 3 · Judge"
                title="The verdict"
                action={
                  job.status === 'done' && (
                    <button
                      onClick={copyMarkdown}
                      className="glass inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-zinc-200 transition hover:border-brand/50 hover:text-white"
                    >
                      {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                      {copied ? 'Copied!' : 'Copy report as Markdown'}
                    </button>
                  )
                }
              />
              <Scorecard data={job.judge} />
            </div>
          )}

          {agents.length > 0 && (
            <div>
              <SectionTitle eyebrow="TinyFish agents" title={running ? 'Watching your app, live' : 'What the agents did'} />
              <AgentGrid agents={agents} bugs={job.testing?.bugs} />
            </div>
          )}

          {job.originality && (
            <div className="fade-in">
              <SectionTitle eyebrow="Stage 1 · Originality" title="Has this been built before?" />
              <OriginalityCard data={job.originality} />
            </div>
          )}

          {job.testing && (
            <div className="fade-in">
              <SectionTitle eyebrow="Stage 2 · Live testing" title={`${job.testing.bugs.length} things the agents found`} />
              <BugList bugs={job.testing.bugs} agents={job.agents} />
            </div>
          )}
        </section>
      )}

      <footer className="relative border-t border-white/5 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-zinc-500 sm:flex-row">
          <span className="flex items-center gap-2">
            <Shield size={14} className="shrink-0 text-zinc-400" />
            Only test apps you own or have permission to test. Agents use fake data, stay read-only, never pay, delete or contact real people.
          </span>
          <span className="shrink-0">
            Powered by <span className="text-accent-300">TinyFish</span>
          </span>
        </div>
      </footer>
    </div>
  )
}

const inputClass =
  'w-full rounded-xl border border-white/8 bg-[#fffaf5]/80 px-4 py-3 text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-brand/70 focus:bg-snow focus:ring-4 focus:ring-brand/10'

function Header({ health }: { health: Health | null }) {
  const up = !!health?.ok
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-lg font-bold tracking-tight text-white">
            LaunchPad <span className="text-brand">AI</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <StatusDot ok={up} text={up ? 'Backend online' : 'Backend offline'} />
          {up && <StatusDot ok={health!.tinyfish_key} text="TinyFish key" />}
          {up && health!.llm && <StatusDot ok text={`LLM: ${health!.llm}`} />}
        </div>
      </div>
    </header>
  )
}

function StatusDot({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className="glass hidden items-center gap-2 rounded-full px-3 py-1.5 text-zinc-300 sm:inline-flex">
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400/70' : 'bg-red-500'}`} />
      {text}
    </span>
  )
}

function SectionTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-xs font-semibold tracking-[0.2em] text-brand uppercase">{eyebrow}</div>
        <h2 className="font-display mt-1.5 text-3xl font-bold tracking-tight text-white">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function Field({ label, icon: Icon, children }: { label: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-zinc-300">
        <Icon size={15} className="text-accent-300" />
        {label}
      </span>
      {children}
    </label>
  )
}
