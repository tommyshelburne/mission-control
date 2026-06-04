import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import type { AgentDTO, AgentPresence } from '@/lib/types';
import { ROSTER_NAMES } from '@/lib/roster';

const STALE_THRESHOLD_SEC = 300;

function buildAgent(hash: Record<string, string>): AgentDTO {
  const nowMs = Date.now();
  const lastHeartbeatMs = hash.last_heartbeat_ms ? Number(hash.last_heartbeat_ms) : null;
  const stalenessSec = lastHeartbeatMs != null ? Math.floor((nowMs - lastHeartbeatMs) / 1000) : null;
  const status = (hash.status as AgentPresence) ?? 'offline';
  const effective_status: AgentPresence =
    stalenessSec === null || stalenessSec > STALE_THRESHOLD_SEC ? 'offline' : status;

  return {
    name: hash.name,
    status,
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

  // Roster-driven, not SCAN-driven: the canonical fleet (lib/roster) defines
  // membership; Redis provides presence. This guarantees every roster agent
  // appears even if it has never heartbeat (claw + quill were missing before),
  // ignores stray/legacy keys, and keeps the count stable and correct (F12).
  const pipeline = redis.pipeline();
  for (const name of ROSTER_NAMES) {
    pipeline.hgetall(`agent:${name}:state`);
  }
  const results = await pipeline.exec();

  const agents: AgentDTO[] = ROSTER_NAMES.map((name, i) => {
    const res = results?.[i];
    const hash =
      res && !res[0] && res[1] && typeof res[1] === 'object'
        ? (res[1] as Record<string, string>)
        : {};
    // Roster name wins over any stale name stored in the hash.
    return buildAgent({ ...hash, name });
  });

  return NextResponse.json({ agents, stale_threshold_seconds: STALE_THRESHOLD_SEC });
}
