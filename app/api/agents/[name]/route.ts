import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const STALE_THRESHOLD_SEC = 300;

export async function GET(_request: Request, props: { params: Promise<{ name: string }> }) {
  const params = await props.params;
  const db = getDb();
  const name = params.name;

  const agent = db
    .prepare(
      `SELECT a.*,
         CASE WHEN a.last_heartbeat IS NULL
              THEN NULL
              ELSE CAST((julianday('now') - julianday(a.last_heartbeat)) * 86400 AS INTEGER)
         END AS staleness_seconds,
         t.title AS current_task_title
       FROM agents a
       LEFT JOIN tasks t ON t.id = a.current_task_id
       WHERE a.name = ?`,
    )
    .get(name) as (Record<string, unknown> & { staleness_seconds: number | null; status: string }) | undefined;

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const effective_status =
    agent.staleness_seconds === null || agent.staleness_seconds > STALE_THRESHOLD_SEC ? 'offline' : agent.status;

  const recent_activity = db
    .prepare(
      `SELECT id, entity_type, entity_id, action, actor, detail, created_at
       FROM activity_log
       WHERE actor = ? OR (entity_type = 'agent' AND entity_id = ?)
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all(name, (agent as any).id);

  return NextResponse.json({
    agent: { ...agent, effective_status },
    recent_activity,
    stale_threshold_seconds: STALE_THRESHOLD_SEC,
  });
}
