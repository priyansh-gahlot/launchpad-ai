export type StageKey = 'originality' | 'testing' | 'judge'
export type StageStatus = 'waiting' | 'running' | 'done' | 'failed' | 'skipped'

export type AgentStatus = 'queued' | 'running' | 'done' | 'failed'

export type AgentState = {
  key: string
  name: string
  icon: string
  status: AgentStatus
  progress: string
  streaming_url: string | null
  url?: string // the page the agent started on
  run_id?: string | null
  result?: Record<string, unknown> | null
  error?: string | null
  error_kind?: 'timeout' | 'queue' | 'site_blocked' | 'login_wall' | 'failed' | null
  http_check?: { checked?: number; broken?: { url: string; problem: string }[]; error?: string } // Link Checker only
}

export type Severity = 'high' | 'medium' | 'low'

export type Bug = {
  agent: string
  severity: Severity
  problem: string
  where: string
}

export type TestingResult = {
  agents: Record<string, AgentState>
  bugs: Bug[]
}

export type SimilarProject = {
  name: string
  url: string
  similarity: 'high' | 'medium' | 'low' | null // null when no LLM scored it
  score?: number // 0-1 keyword overlap with the idea
  how_different: string
}

export type OriginalityResult = {
  originality_score: number | null
  summary: string
  similar_projects: SimilarProject[]
  how_to_stand_out: string[]
  queries: string[]
}

export type ScoreArea = 'idea_originality' | 'works_as_promised' | 'ui_ux' | 'docs_readme'

export type JudgeResult = {
  total_score: number
  scores: Record<ScoreArea, number>
  bugs_found: number
  top_3_fixes: string[]
  judge_comment: string
  breakdown: { area: ScoreArea; points: number; reason: string }[]
  project_summary: string | null
}

export type JobState = {
  jobId: string | null
  status: 'idle' | 'running' | 'done' | 'failed'
  stages: Record<StageKey, StageStatus>
  stageText: Partial<Record<StageKey, string>>
  agents: Record<string, AgentState>
  agentOrder: string[]
  originality: OriginalityResult | null
  testing: TestingResult | null
  judge: JudgeResult | null
  error: string | null
  note: string | null // e.g. "Instant result: cached" or "Demo mode"
  input: JobInput | null
  startedAt: number | null // live runs only, for the elapsed timer
  finishedAt: number | null
}

export type JobInput = { idea: string; repo_url: string; demo_url: string; extra_agents?: boolean }
