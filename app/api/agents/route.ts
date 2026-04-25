import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';

const STALE_THRESHOLD_SEC = 300;

interface AgentHash {
  name: string;
  status: string;
  last_heartbeat_ms: string;
  current_task_id: string;
  current_task_title: string;
  current_activity: string;
  model: string;
}

function buildAgent(hash: Record<string, string>) {
  const nowMs = Date.now();
  const lastHeartbeatMs = hash.last_heartbeat_ms ? Number(hash.last_heartbeat_ms) : null;
  const stalenessSec = lastHeartbeatMs != null ? Math.floor((nowMs - lastHeartbeatMs) / 1000) : null;
  const effective_status =
    stalenessSec === null || stalenessSec > STALE_THRESHOLD_SEC ? 'offline' : hash.status;

  return {
    name: hash.name,
    status: hash.status ?? 'offline',
    last_heartbeat_ms: lastHeartbeatMs,
    current_task_id: hash.current_task_id ? Number(hash.current_task_id) : null,
    current_task_title: hash.current_task_title ?? null,
    current_activity: hash.current_activity ?? '',
    model: hash.model ?? '',
    staleness_seconds: stalenessSec,
    effective_status,
  };
}

export async function GET() {
  const redis = getRedis();

  // SCAN for all agent state keys — never KEYS
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', 'agent:*:state', 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');

  if (keys.length === 0) {
    return NextResponse.json({ agents: [], stale_threshold_seconds: STALE_THRESHOLD_SEC });
  }

  // Fetch all hashes in parallel
  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.hgetall(key);
  }
  const results = await pipeline.exec();

  const agents = (results ?? [])
    .map(([err, hash]) => {
      if (err || !hash || typeof hash !== 'object') return null;
      return buildAgent(hash as Record<string, string>);
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ agents, stale_threshold_seconds: STALE_THRESHOLD_SEC });
}
