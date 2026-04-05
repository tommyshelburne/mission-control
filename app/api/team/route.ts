export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const AGENTS_DIR = '/home/claw/.openclaw/workspace/agents';
const CRON_JOBS_PATH = '/home/claw/.openclaw/cron/jobs.json';


interface TeamMember {
  key: string;
  name: string;
  role: string;
  model: string;
  status: 'active' | 'idle' | 'error' | 'unknown';
  last_run: string | null;
  inbox_pending: number;
  skills: string[];
  color: string;
}

const TEAM: Omit<TeamMember, 'status' | 'last_run' | 'inbox_pending'>[] = [
  { key: 'tommy', name: 'Tommy', role: 'Human \u00b7 Owner', model: '', skills: ['Strategy', 'Decisions', 'Leadership'], color: '#3b82f6' },
  { key: 'claw', name: 'Claw', role: 'Chief of Staff', model: 'claude-sonnet-4-6', skills: ['Orchestration', 'Planning', 'Code'], color: '#5b5bd6' },
  { key: 'rex', name: 'Rex', role: 'Head Engineer', model: 'claude-sonnet-4-6', skills: ['Backend', 'Frontend', 'Infra'], color: '#22c55e' },
  { key: 'scout', name: 'Scout', role: 'Researcher', model: 'gemini-2.0-flash', skills: ['Research', 'Analysis', 'Intel'], color: '#f59e0b' },
  { key: 'atlas', name: 'Atlas', role: 'GTM Ops', model: 'deepseek-v3.2', skills: ['Pipeline', 'Proposals', 'Gov'], color: '#ef4444' },
  { key: 'herald', name: 'Herald', role: 'Morning Briefing', model: 'gemini-2.0-flash-lite', skills: ['Digest', 'Comms', 'Alerts'], color: '#8b5cf6' },
  { key: 'lens', name: 'Lens', role: 'Data Analyst', model: 'qwen-2.5-72b', skills: ['Data', 'Metrics', 'Reports'], color: '#06b6d4' },
  { key: 'quill', name: 'Quill', role: 'Writer', model: 'deepseek-v3.2', skills: ['Writing', 'Proposals', 'Docs'], color: '#ec4899' },
  { key: 'coach', name: 'Coach', role: 'Career Prep', model: 'deepseek-v3.2', skills: ['Interview', 'Resume', 'Prep'], color: '#f97316' },
  { key: 'warden', name: 'Warden', role: 'Monitoring', model: 'gemini-2.0-flash-lite', skills: ['Alerts', 'Security', 'Uptime'], color: '#64748b' },
];

function getFileMtime(filePath: string): Date | null {
  try {
    const stat = fs.statSync(filePath);
    return stat.mtime;
  } catch {
    return null;
  }
}

function getLastRun(key: string): string | null {
  const dailySummary = path.join(AGENTS_DIR, key, 'DAILY_SUMMARY.md');
  const mtime = getFileMtime(dailySummary);
  if (mtime) return mtime.toISOString();

  const memory = path.join(AGENTS_DIR, key, 'MEMORY.md');
  const memMtime = getFileMtime(memory);
  if (memMtime) return memMtime.toISOString();

  return null;
}

function getInboxPending(key: string): number {
  try {
    const inboxPath = path.join(AGENTS_DIR, key, 'INBOX.md');
    const content = fs.readFileSync(inboxPath, 'utf-8');
    const matches = content.match(/^Status:\s*PENDING/gim);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

function getAgentStatus(key: string): 'active' | 'idle' | 'error' | 'unknown' {
  try {
    // Check cron jobs for recent run (within 30 minutes)
    try {
      const cronData = JSON.parse(fs.readFileSync(CRON_JOBS_PATH, 'utf-8'));
      const jobs = Array.isArray(cronData) ? cronData : cronData.jobs || [];
      const agentJob = jobs.find((j: { agent?: string; name?: string }) =>
        j.agent === key || (j.name && j.name.toLowerCase().includes(key))
      );
      if (agentJob && agentJob.lastRunAtMs) {
        const elapsed = Date.now() - agentJob.lastRunAtMs;
        if (elapsed < 30 * 60 * 1000) return 'active';
      }
    } catch {
      // cron file may not exist
    }

    // Check if DAILY_SUMMARY.md was modified within last 15 minutes
    const dailySummary = path.join(AGENTS_DIR, key, 'DAILY_SUMMARY.md');
    const mtime = getFileMtime(dailySummary);
    if (mtime) {
      const elapsed = Date.now() - mtime.getTime();
      if (elapsed < 15 * 60 * 1000) return 'active';
    }

    return 'idle';
  } catch {
    return 'unknown';
  }
}

export async function GET() {
  const team: TeamMember[] = TEAM.map((member) => {
    if (member.key === 'tommy') {
      return {
        ...member,
        status: 'active' as const,
        last_run: null,
        inbox_pending: 0,
      };
    }

    return {
      ...member,
      status: getAgentStatus(member.key),
      last_run: getLastRun(member.key),
      inbox_pending: getInboxPending(member.key),
    };
  });

  return NextResponse.json({ team });
}
