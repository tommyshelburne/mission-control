// Path constants are derived from OPENCLAW_HOME / OPENCLAW_ROOT at module-load
// time. setup.ts redirects both to a tmp dir, so the imported constants here
// reflect that redirected world — and that's exactly what we assert: nothing
// resolves into the real /home/claw/.openclaw workspace.

import { describe, it, expect } from 'vitest';
import path from 'node:path';

import {
  OPENCLAW_HOME,
  OPENCLAW_ROOT,
  PROJECTS_DIR,
  NOTES_DIR,
  MEMORY_DIR,
  MEMORY_MD,
  ESCALATIONS_MD,
  SCOUT_RESEARCH_DIR,
  MC_REPO,
  DB_PATH,
  TICKTICK_TOKEN,
  SECRETS_FILE,
  CRON_DIR,
  CRON_JOBS_JSON,
  USAGE_SCRIPT,
} from '@/lib/paths';

describe('paths', () => {
  it('roots in the test tmp dir, not /home/claw/.openclaw', () => {
    expect(OPENCLAW_HOME).toBe(process.env.OPENCLAW_HOME);
    expect(OPENCLAW_ROOT).toBe(process.env.OPENCLAW_ROOT);
    expect(OPENCLAW_HOME).not.toContain('.openclaw');
  });

  it('places workspace constants under OPENCLAW_ROOT', () => {
    for (const p of [PROJECTS_DIR, MEMORY_DIR, MEMORY_MD, ESCALATIONS_MD, SCOUT_RESEARCH_DIR, MC_REPO, TICKTICK_TOKEN]) {
      expect(p.startsWith(OPENCLAW_ROOT)).toBe(true);
    }
  });

  it('places home-only constants under OPENCLAW_HOME but not under workspace', () => {
    for (const p of [SECRETS_FILE, CRON_DIR, CRON_JOBS_JSON, USAGE_SCRIPT]) {
      expect(p.startsWith(OPENCLAW_HOME)).toBe(true);
      expect(p.startsWith(OPENCLAW_ROOT)).toBe(false);
    }
  });

  it('DB_PATH is mission-control/data/mc.db inside the workspace', () => {
    expect(DB_PATH).toBe(path.join(MC_REPO, 'data', 'mc.db'));
  });

  it('NOTES_DIR is the notes/ subdir of PROJECTS_DIR', () => {
    expect(NOTES_DIR).toBe(path.join(PROJECTS_DIR, 'notes'));
  });
});
