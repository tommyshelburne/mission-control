import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AgentRow {
  agent: string;
  hits: number;
  misses: number;
  hit_rate: number | null;
  cost_saved_usd: number;
  cost_paid_usd: number;
  artifacts_cached: number;
  sample_size: number;
}

const TRACKED_AGENTS = ['warden'] as const;

const GATE_THRESHOLD = 10;

export async function GET() {
  const r = getRedis();

  const agents: AgentRow[] = [];
  for (const agent of TRACKED_AGENTS) {
    const counters = await r.hgetall(`mc:counters:anticipation:${agent}`);
    const hits = Number(counters.hit ?? 0);
    const misses = Number(counters.miss ?? 0);
    const sample = hits + misses;
    const hitRate = sample > 0 ? hits / sample : null;
    const artifactsCached = await r.scard(`prep_artifacts:${agent}:keys`);
    agents.push({
      agent,
      hits,
      misses,
      hit_rate: hitRate,
      cost_saved_usd: Number(counters.cost_saved_usd ?? 0),
      cost_paid_usd: Number(counters.cost_paid_usd ?? 0),
      artifacts_cached: artifactsCached,
      sample_size: sample,
    });
  }

  const fleet = {
    hits: agents.reduce((s, a) => s + a.hits, 0),
    misses: agents.reduce((s, a) => s + a.misses, 0),
    cost_saved_usd: agents.reduce((s, a) => s + a.cost_saved_usd, 0),
    cost_paid_usd: agents.reduce((s, a) => s + a.cost_paid_usd, 0),
  };

  return NextResponse.json({
    agents,
    fleet,
    gate_threshold: GATE_THRESHOLD,
    updated_at: new Date().toISOString(),
  });
}
