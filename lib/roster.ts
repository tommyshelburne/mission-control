/**
 * The canonical, user-facing agent fleet — the SINGLE source of truth for
 * "who is an agent," consumed by the Agents page (presence) and the Costs page
 * (cost rollup). Before this, three surfaces disagreed on the count: the Agents
 * page showed however many Redis state keys happened to exist (9), Costs showed
 * the distinct cost buckets (16), and the real roster is 11 (triage F12).
 *
 * Derived from openclaw.json's `agents.list`, filtered to the human-facing
 * fleet. The extra cost buckets there (`main`, `claw-daily`, `claw-planner`,
 * `hermes-opus`, `warden-pretailor`) are sub-modes that bill separately but
 * belong to one roster member — see COST_BUCKET_PARENT. `gemini` is a tool, not
 * a fleet member, so it is intentionally absent from the roster (it still shows
 * as its own Costs row).
 *
 * Keep this in sync with openclaw.json when the roster changes.
 */
export interface RosterAgent {
  name: string;
  role: string;
  color: string;
}

export const ROSTER: RosterAgent[] = [
  { name: 'claw',   role: 'Chief of Staff',       color: '#5b5bd6' },
  { name: 'rex',    role: 'Head Engineer',        color: '#22c55e' },
  { name: 'hermes', role: 'Research / Reasoning',  color: '#06b6d4' },
  { name: 'quill',  role: 'Writer',               color: '#ec4899' },
  { name: 'scout',  role: 'Researcher',           color: '#f59e0b' },
  { name: 'coach',  role: 'Interview Prep',       color: '#14b8a6' },
  { name: 'warden', role: 'Oversight / Monitor',   color: '#ef4444' },
  { name: 'herald', role: 'Morning Brief',        color: '#8b5cf6' },
  { name: 'sage',   role: 'Skill Curriculum',     color: '#a855f7' },
  { name: 'pulse',  role: 'Network & Community',   color: '#f43f5e' },
  { name: 'ledger', role: 'Runway & Finance',     color: '#eab308' },
];

export const ROSTER_NAMES: string[] = ROSTER.map((a) => a.name);

/**
 * Maps an agent_cost_daily bucket name to its canonical roster member, so cost
 * sub-modes roll up instead of inflating the agent count. Anything not listed
 * (e.g. 'gemini') passes through unchanged as its own row.
 */
export const COST_BUCKET_PARENT: Record<string, string> = {
  main: 'claw',
  'claw-planner': 'claw',
  'claw-daily': 'claw',
  'hermes-opus': 'hermes',
  'warden-pretailor': 'warden',
};

export function canonicalAgent(bucket: string): string {
  return COST_BUCKET_PARENT[bucket] ?? bucket;
}
