import path from 'path';

// All filesystem paths read or written by the app are derived from these two
// roots. Defaults match the original deploy. Override via env to relocate the
// install (local dev on a different machine, sandbox testing, etc.).
//
//   OPENCLAW_HOME — parent dir holding scripts/, cron/, secrets.json
//   OPENCLAW_ROOT — workspace tree (projects, memory, agents, mission-control)
//
// Changing these does NOT migrate data — set them before first run, or move
// data to match.

export const OPENCLAW_HOME =
  process.env.OPENCLAW_HOME ?? '/home/claw/.openclaw';
export const OPENCLAW_ROOT =
  process.env.OPENCLAW_ROOT ?? path.join(OPENCLAW_HOME, 'workspace');

// Workspace tree (under OPENCLAW_ROOT)
export const PROJECTS_DIR = path.join(OPENCLAW_ROOT, 'projects');
export const NOTES_DIR = path.join(PROJECTS_DIR, 'notes');
export const MEMORY_DIR = path.join(OPENCLAW_ROOT, 'memory');
export const MEMORY_MD = path.join(OPENCLAW_ROOT, 'MEMORY.md');
export const ESCALATIONS_MD = path.join(OPENCLAW_ROOT, 'ESCALATIONS.md');
export const SCOUT_RESEARCH_DIR = path.join(
  OPENCLAW_ROOT,
  'agents',
  'scout',
  'research',
);
export const MC_REPO = path.join(OPENCLAW_ROOT, 'mission-control');
export const DB_PATH = path.join(MC_REPO, 'data', 'mc.db');
export const TICKTICK_TOKEN = path.join(OPENCLAW_ROOT, '.ticktick-token.json');

// Outside workspace, under OPENCLAW_HOME
export const SECRETS_FILE = path.join(OPENCLAW_HOME, 'secrets.json');
export const CRON_DIR = path.join(OPENCLAW_HOME, 'cron');
export const CRON_JOBS_JSON = path.join(CRON_DIR, 'jobs.json');
export const USAGE_SCRIPT = path.join(
  OPENCLAW_HOME,
  'scripts',
  'usage',
  'report.py',
);
