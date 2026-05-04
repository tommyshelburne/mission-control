#!/usr/bin/env -S npx tsx
/**
 * Polls openclaw cron run JSONL files and posts idle heartbeats to Mission Control
 * for each newly-finished run. Run every minute via systemd timer.
 *
 * openclaw cron invokes agentTurns internally (no shell hook), and the JSONL only
 * records 'finished' events — no real-time 'started' signal. So we can only emit
 * post-completion heartbeats. The MC dashboard's 300s staleness guard handles
 * showing agents as offline between runs.
 *
 * State: <CRON_DIR>/mc-heartbeat-sync-state.json tracks the
 * last-processed `ts` (ms) per jobId so we only emit heartbeats for new entries.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CRON_DIR, CRON_JOBS_JSON } from '../lib/paths';

const RUNS_DIR = path.join(CRON_DIR, 'runs');
const JOBS_FILE = CRON_JOBS_JSON;
const STATE_FILE = path.join(CRON_DIR, 'mc-heartbeat-sync-state.json');
const MC_URL = process.env.MC_URL ?? 'http://localhost:3000';

type JobMeta = { name: string; agent: string | null };
type State = { lastTsByJob: Record<string, number> };

function loadJobs(): Record<string, JobMeta> {
  const raw = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  const byId: Record<string, JobMeta> = {};
  for (const j of raw.jobs ?? []) {
    const inferred = j.agentId ?? j.name?.split('-')[0]?.split(':')[0] ?? null;
    byId[j.id] = { name: j.name, agent: inferred };
  }
  return byId;
}

function loadState(): State {
  if (!fs.existsSync(STATE_FILE)) return { lastTsByJob: {} };
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastTsByJob: {} }; }
}

function saveState(s: State) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

async function fetchKnownAgents(): Promise<Set<string>> {
  const res = await fetch(`${MC_URL}/api/agents`);
  if (!res.ok) throw new Error(`GET /api/agents ${res.status}`);
  const j = (await res.json()) as { agents: Array<{ name: string }> };
  return new Set(j.agents.map((a) => a.name));
}

async function postHeartbeat(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${MC_URL}/api/agents/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type CronEntry = { action: string; ts?: number; status?: string; durationMs?: number; [key: string]: unknown };

function parseJsonl(filePath: string): CronEntry[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const rows: CronEntry[] = [];
  for (const line of lines) {
    try { rows.push(JSON.parse(line) as CronEntry); } catch { /* skip malformed */ }
  }
  return rows;
}

async function main() {
  const jobs = loadJobs();
  const state = loadState();
  const known = await fetchKnownAgents();

  let emitted = 0;
  let skippedUnknown = 0;

  const files = fs.existsSync(RUNS_DIR) ? fs.readdirSync(RUNS_DIR).filter((f) => f.endsWith('.jsonl')) : [];
  for (const file of files) {
    const jobId = file.replace(/\.jsonl$/, '');
    const meta = jobs[jobId];
    if (!meta) continue;
    if (!meta.agent || !known.has(meta.agent)) {
      skippedUnknown++;
      continue;
    }

    const rows = parseJsonl(path.join(RUNS_DIR, file));
    const lastSeen = state.lastTsByJob[jobId] ?? 0;
    let maxTsThisJob = lastSeen;

    for (const r of rows) {
      if (r.action !== 'finished') continue;
      const ts = typeof r.ts === 'number' ? r.ts : 0;
      if (ts <= lastSeen) continue;

      const durationS = Math.round((r.durationMs ?? 0) / 1000);
      const statusOk = r.status === 'ok';
      const activity = `${meta.name}${durationS > 0 ? ` (${durationS}s${statusOk ? '' : ' — ' + r.status})` : ''}`;

      const ok = await postHeartbeat({
        name: meta.agent,
        status: 'idle',
        currentActivity: activity,
      });
      if (ok) {
        emitted++;
        maxTsThisJob = Math.max(maxTsThisJob, ts);
      } else {
        // bail out of this file; retry next cycle
        break;
      }
    }

    state.lastTsByJob[jobId] = maxTsThisJob;
  }

  saveState(state);
  console.log(JSON.stringify({ emitted, skippedUnknown, jobs: Object.keys(jobs).length }));
}

main().catch((e) => {
  console.error('[cron-heartbeat-sync] error:', e.message);
  process.exit(1);
});
