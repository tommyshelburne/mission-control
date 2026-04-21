import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const VALID_STATUSES = ['idle', 'busy', 'offline'] as const;
type AgentStatus = (typeof VALID_STATUSES)[number];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, status, currentTaskId, currentActivity, model } = body as {
    name?: string;
    status?: string;
    currentTaskId?: number | null;
    currentActivity?: string;
    model?: string;
  };

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO agents (name, status, current_task_id, current_activity, model, last_heartbeat, updated_at)
    VALUES (@name, @status, @currentTaskId, @currentActivity, @model, datetime('now'), datetime('now'))
    ON CONFLICT(name) DO UPDATE SET
      status           = excluded.status,
      current_task_id  = excluded.current_task_id,
      current_activity = COALESCE(excluded.current_activity, agents.current_activity),
      model            = COALESCE(NULLIF(excluded.model, ''), agents.model),
      last_heartbeat   = excluded.last_heartbeat,
      updated_at       = excluded.updated_at
  `);

  upsert.run({
    name: name.trim(),
    status,
    currentTaskId: currentTaskId ?? null,
    currentActivity: currentActivity ?? '',
    model: model ?? '',
  });

  db.prepare(`
    INSERT INTO activity_log (entity_type, entity_id, action, actor, detail)
    VALUES ('agent', (SELECT id FROM agents WHERE name = ?), 'heartbeat', ?, ?)
  `).run(
    name.trim(),
    name.trim(),
    JSON.stringify({ status, currentTaskId: currentTaskId ?? null, currentActivity: currentActivity ?? '' }),
  );

  const agent = db.prepare('SELECT * FROM agents WHERE name = ?').get(name.trim());
  return NextResponse.json({ agent });
}
