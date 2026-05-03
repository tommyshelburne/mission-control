import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Row {
  agent: string;
  day: string;
  provider: string;
  turns: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_cost_usd: number;
  shadow_cost_usd: number;
  rolled_up_at: string;
}

interface AgentTotals {
  agent: string;
  total_cost_usd: number;
  shadow_cost_usd: number;
  total_savings_usd: number;
  turns: number;
  providers: Record<string, { turns: number; total_cost_usd: number; shadow_cost_usd: number }>;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '14', 10) || 14, 1), 90);

  const db = getDb();
  const sinceDay = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT agent, day, provider, turns, input_tokens, output_tokens,
           cache_read_tokens, cache_write_tokens,
           total_cost_usd, shadow_cost_usd, rolled_up_at
    FROM agent_cost_daily
    WHERE day >= @since
    ORDER BY day DESC, agent ASC, provider ASC
  `).all({ since: sinceDay }) as Row[];

  // Per-agent rollup across the window (for the dashboard cards).
  const byAgent = new Map<string, AgentTotals>();
  for (const r of rows) {
    let entry = byAgent.get(r.agent);
    if (!entry) {
      entry = {
        agent: r.agent,
        total_cost_usd: 0,
        shadow_cost_usd: 0,
        total_savings_usd: 0,
        turns: 0,
        providers: {},
      };
      byAgent.set(r.agent, entry);
    }
    entry.total_cost_usd += r.total_cost_usd;
    entry.shadow_cost_usd += r.shadow_cost_usd;
    entry.turns += r.turns;
    const p = entry.providers[r.provider] ?? { turns: 0, total_cost_usd: 0, shadow_cost_usd: 0 };
    p.turns += r.turns;
    p.total_cost_usd += r.total_cost_usd;
    p.shadow_cost_usd += r.shadow_cost_usd;
    entry.providers[r.provider] = p;
  }
  // Pocketbook savings = shadow - actual (shadow > actual when membership wins).
  for (const a of byAgent.values()) {
    a.total_savings_usd = Math.max(0, a.shadow_cost_usd - a.total_cost_usd);
  }

  const agents = [...byAgent.values()].sort(
    (a, b) => b.total_cost_usd + b.shadow_cost_usd - (a.total_cost_usd + a.shadow_cost_usd),
  );

  const fleet = {
    total_cost_usd: agents.reduce((s, a) => s + a.total_cost_usd, 0),
    shadow_cost_usd: agents.reduce((s, a) => s + a.shadow_cost_usd, 0),
    total_savings_usd: agents.reduce((s, a) => s + a.total_savings_usd, 0),
    turns: agents.reduce((s, a) => s + a.turns, 0),
  };

  return NextResponse.json({ days, since: sinceDay, agents, fleet, daily: rows });
}
