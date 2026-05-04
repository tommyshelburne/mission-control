import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { PROJECTS_DIR } from '@/lib/paths';

const APPLIED_JSON = path.join(PROJECTS_DIR, 'job-search', 'applied.json');

interface AppliedEntry {
  company: string;
  title: string;
  applied_date: string;
  source: string;
  outcome: string;
  url?: string;
  notes?: string;
  evidence?: string[];
  _allow_resurface?: boolean;
}

interface AppliedPayload {
  applied: Record<string, AppliedEntry>;
  lastUpdated?: string | null;
}

export async function GET() {
  try {
    const raw = await fs.readFile(APPLIED_JSON, 'utf8');
    const data: AppliedPayload = JSON.parse(raw);
    const entries = Object.entries(data.applied || {})
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (b.applied_date || '').localeCompare(a.applied_date || ''));
    return NextResponse.json({
      entries,
      lastUpdated: data.lastUpdated ?? null,
      count: entries.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { entries: [], lastUpdated: null, count: 0, error: msg },
      { status: 200 },
    );
  }
}
