import { Bomb, BookOpen, Bot, Eye, Link2, Rocket, Telescope, UserPlus, type LucideIcon } from 'lucide-react'

// One icon per agent, used by the live tiles and the bug list.
const AGENT_ICONS: Record<string, LucideIcon> = {
  link_checker: Link2,
  signup_flow: UserPlus,
  first_impression: Eye,
  bad_inputs: Bomb,
  competitor_scout: Telescope,
  repo_reader: BookOpen,
}

export function AgentIcon({ agentKey, size = 18 }: { agentKey: string; size?: number }) {
  const Icon = AGENT_ICONS[agentKey] ?? Bot
  return <Icon size={size} strokeWidth={2} />
}

const TONES = {
  brand: 'bg-brand/10 text-accent-300 ring-brand/25',
  neutral: 'bg-white/5 text-zinc-300 ring-white/10',
}

/** A rounded tile holding an icon: the one icon style used across the app. */
export function IconTile({
  icon: Icon,
  size = 'md',
  tone = 'brand',
}: {
  icon: LucideIcon
  size?: 'sm' | 'md' | 'lg'
  tone?: keyof typeof TONES
}) {
  const box = { sm: 'h-8 w-8 rounded-lg', md: 'h-11 w-11 rounded-xl', lg: 'h-12 w-12 rounded-2xl' }[size]
  const px = { sm: 16, md: 20, lg: 22 }[size]
  return (
    <span className={`grid shrink-0 place-items-center ring-1 ${box} ${TONES[tone]}`}>
      <Icon size={px} strokeWidth={2} />
    </span>
  )
}

export function Logo() {
  return (
    <span className="btn-glow grid h-9 w-9 place-items-center rounded-xl text-snow">
      <Rocket size={19} strokeWidth={2.4} />
    </span>
  )
}
