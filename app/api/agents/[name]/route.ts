import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { getDb } from '@/lib/db';

const STALE_THRESHOLD_SEC = 300;

export async function GET(_request: Request, props: { params: Promise<{ name: string }> }) {
  const params = await props.params;
  const agentName = params.name;
  const redis = getRedis();

  const hash = await redis.hgetall(`agent:${agentName}:state`);

  if (!hash || !hash.name) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const nowMs = Date.now();
  const lastHeartbeatMs = hash.last_heartbeat_ms ? Number(hash.last_heartbeat_ms) : null;
  const stalenessSec = lastHeartbeatMs != null ? Math.floor((nowMs - lastHeartbeatMs) / 1000) : null;
  const effective_status =
    stalenessSec === null || stalenessSec > STALE_THRESHOLD_SEC ? 'offline' : hash.status;

  const agent = {
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

  // recent_activity still reads from SQLite activity_log — not in scope for this port
  const db = getDb();
  const recent_activity = db
    .prepare(
      `SELECT id, entity_type, entity_id, action, actor, detail, created_at
       FROM activity_log
       WHERE actor = ?
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all(agentName);

  return NextResponse.json({
    agent,
    recent_activity,
    stale_threshold_seconds: STALE_THRESHOLD_SEC,
  });
}
