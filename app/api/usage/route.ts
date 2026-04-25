import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { USAGE_SCRIPT } from '@/lib/paths';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DayTotals = {
  turns: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

type ReportOutput = Record<string, {
  totals: DayTotals;
  byAgentProvider: Record<string, DayTotals>;
}>;

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUtcIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function readLocalUsage(): {
  anthropicToday: number | null;
  anthropicYesterday: number | null;
  totalToday: number | null;
  cacheWriteToday: number | null;
  mainTurnsToday: number | null;
} {
  try {
    const raw = execSync(
      `python3 ${USAGE_SCRIPT} --days 2 --json`,
      { encoding: 'utf8', timeout: 5000 },
    );
    const parsed = JSON.parse(raw) as ReportOutput;
    const today = todayUtcIso();
    const yesterday = yesterdayUtcIso();
    const sumProviderCost = (day: string, provider: string) => {
      const d = parsed[day];
      if (!d) return null;
      let cost = 0;
      for (const [key, b] of Object.entries(d.byAgentProvider)) {
        if (key.endsWith(`/${provider}`)) cost += b.cost;
      }
      return cost;
    };
    const mainTurns = (day: string) => {
      const d = parsed[day];
      if (!d) return null;
      let turns = 0;
      for (const [key, b] of Object.entries(d.byAgentProvider)) {
        if (key.startsWith('main/')) turns += b.turns;
      }
      return turns;
    };
    return {
      anthropicToday: sumProviderCost(today, 'anthropic'),
      anthropicYesterday: sumProviderCost(yesterday, 'anthropic'),
      totalToday: parsed[today]?.totals.cost ?? 0,
      cacheWriteToday: parsed[today]?.totals.cacheWrite ?? 0,
      mainTurnsToday: mainTurns(today),
    };
  } catch {
    return {
      anthropicToday: null,
      anthropicYesterday: null,
      totalToday: null,
      cacheWriteToday: null,
      mainTurnsToday: null,
    };
  }
}

export async function GET() {
  const local = readLocalUsage();

  const apiKey = process.env.OPENROUTER_API_KEY;
  let openrouter: number | null = null;
  if (apiKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        const usageDaily: number | undefined = data?.data?.usage_daily;
        openrouter = typeof usageDaily === 'number' ? usageDaily * 0.000001 : null;
      }
    } catch {
      openrouter = null;
    }
  }

  return NextResponse.json({
    openrouter,
    ...local,
  });
}
