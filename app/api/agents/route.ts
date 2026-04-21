import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const STALE_THRESHOLD_SEC = 300;

export async function GET() {
  const db = getDb();

  const agents = db
    .prepare(
      `SELECT a.*,
         CASE WHEN a.last_heartbeat IS NULL
              THEN NULL
              ELSE CAST((julianday('now') - julianday(a.last_heartbeat)) * 86400 AS INTEGER)
         END AS staleness_seconds,
         t.title AS current_task_title
       FROM agents a
       LEFT JOIN tasks t ON t.id = a.current_task_id
       ORDER BY a.name ASC`,
    )
    .all() as Array<Record<string, unknown> & { staleness_seconds: number | null; status: string }>;

  // UI-facing effective status: if last_heartbeat is older than threshold, render offline
  // regardless of stored status (protects against crashed-agent lying about being busy).
  const withEffective = agents.map((a) => ({
    ...a,
    effective_status:
      a.staleness_seconds === null || a.staleness_seconds > STALE_THRESHOLD_SEC ? 'offline' : a.status,
  }));

  return NextResponse.json({ agents: withEffective, stale_threshold_seconds: STALE_THRESHOLD_SEC });
}
