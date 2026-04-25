export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { ESCALATIONS_MD, CRON_JOBS_JSON } from '@/lib/paths';
import { getDb } from '@/lib/db';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

interface Task {
  id: number;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  project: string;
  due_date: string;
  created_at: string;
  updated_at: string;
}

interface Escalation {
  date: string;
  level: string;
  title: string;
  body: string;
}

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
  lastRun: string;
}

function parseEscalations(): Escalation[] {
  const filePath = ESCALATIONS_MD;
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const escalations: Escalation[] = [];

  // Split by ## headings
  const sections = content.split(/^## /m).slice(1); // skip preamble

  for (const section of sections) {
    const lines = section.split('\n');
    const heading = lines[0].trim();

    // Format A: [YYYY-MM-DD] LEVEL — Title
    const matchA = heading.match(/^\[(\d{4}-\d{2}-\d{2})\]\s+(\w+)\s+[—–-]\s+(.+)$/);
    // Format B: [YYYY-MM-DD HH:MM] Source: Title
    const matchB = heading.match(/^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\]\s+(\w+):\s+(.+)$/);

    if (matchA) {
      const bodyLines: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---' || lines[i].startsWith('## ')) break;
        bodyLines.push(lines[i]);
      }
      escalations.push({
        date: matchA[1],
        level: matchA[2],
        title: matchA[3],
        body: bodyLines.join('\n').trim(),
      });
    } else if (matchB) {
      const bodyLines: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---' || lines[i].startsWith('## ')) break;
        bodyLines.push(lines[i]);
      }
      escalations.push({
        date: matchB[1],
        level: matchB[2],
        title: matchB[3],
        body: bodyLines.join('\n').trim(),
      });
    }
  }

  return escalations.slice(-12);
}

function parseCronJobs(): CronJob[] {
  const filePath = CRON_JOBS_JSON;
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    const jobs = data.jobs || data;

    if (!Array.isArray(jobs)) return [];

    return jobs.map((job: Record<string, unknown>) => {
      let schedule = '';
      if (typeof job.schedule === 'string') {
        schedule = job.schedule;
      } else if (job.schedule && typeof job.schedule === 'object') {
        const sched = job.schedule as Record<string, unknown>;
        schedule = String(sched.expr || sched.cron || '');
        if (sched.tz) schedule += ` (${sched.tz})`;
      }

      const state = (job.state || {}) as Record<string, unknown>;
      let lastRun = '';
      if (state.lastRunAtMs) {
        lastRun = new Date(state.lastRunAtMs as number).toISOString();
      }

      return {
        id: String(job.id || ''),
        name: String(job.name || ''),
        schedule,
        description: String(job.description || ''),
        enabled: Boolean(job.enabled),
        lastRun,
      };
    });
  } catch {
    return [];
  }
}

function getBidMatchStatus(): { running: boolean; enabled: boolean; detail: string } {
  let running = false;
  let enabled = false;
  let detail = 'Service status unknown';

  try {
    const activeResult = execSync('systemctl is-active bidmatch 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    running = activeResult === 'active';
  } catch {
    // Service may not exist
  }

  try {
    const enabledResult = execSync('systemctl is-enabled bidmatch 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    enabled = enabledResult === 'enabled';
  } catch {
    // Service may not exist
  }

  if (running && enabled) detail = 'Running and enabled';
  else if (running && !enabled) detail = 'Running but not enabled at boot';
  else if (!running && enabled) detail = 'Stopped but enabled at boot';
  else detail = 'Stopped and disabled';

  return { running, enabled, detail };
}

export async function GET() {
  const db = getDb();
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00');
  const todayStr = today.toISOString().slice(0, 10);

  const taskCounts = db
    .prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status')
    .all() as { status: string; count: number }[];

  const overdueTasks = db
    .prepare(
      "SELECT * FROM tasks WHERE due_date < ? AND due_date != '' AND status != 'done' ORDER BY due_date ASC"
    )
    .all(todayStr) as Task[];

  const dueTodayTasks = db
    .prepare(
      "SELECT * FROM tasks WHERE due_date = ? AND status != 'done' ORDER BY priority ASC"
    )
    .all(todayStr) as Task[];

  const inProgressTasks = db
    .prepare(
      "SELECT * FROM tasks WHERE status = 'in-progress' ORDER BY due_date ASC"
    )
    .all() as Task[];

  const blockedTasks = db
    .prepare(
      "SELECT * FROM tasks WHERE status = 'blocked' ORDER BY due_date ASC"
    )
    .all() as Task[];

  const escalations = parseEscalations();
  const cronJobs = parseCronJobs();
  const bidmatch = getBidMatchStatus();

  return NextResponse.json({
    date: todayStr,
    taskCounts,
    overdueTasks,
    dueTodayTasks,
    inProgressTasks,
    blockedTasks,
    escalations,
    cronJobs,
    bidmatch,
  });
}
