import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const VALID_ENTITY_TYPES = ['task', 'project', 'agent', 'system'] as const;
const VALID_ACTIONS = ['created', 'updated', 'status_changed', 'commented', 'deleted', 'heartbeat'] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entity_type');
  const entityId = searchParams.get('entity_id');
  const actor = searchParams.get('actor');
  const action = searchParams.get('action');
  const since = searchParams.get('since'); // ISO timestamp lower bound
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 500);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10) || 0;

  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (entityType) { where.push('a.entity_type = @entity_type'); params.entity_type = entityType; }
  if (entityId)   { where.push('a.entity_id = @entity_id');     params.entity_id = Number(entityId); }
  if (actor)      { where.push('a.actor = @actor');             params.actor = actor; }
  if (action)     { where.push('a.action = @action');           params.action = action; }
  if (since)      { where.push('a.created_at >= @since');       params.since = since; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const db = getDb();

  const rows = db.prepare(`
    SELECT a.*,
      CASE a.entity_type
        WHEN 'task'    THEN (SELECT title FROM tasks    WHERE id = a.entity_id)
        WHEN 'project' THEN (SELECT name  FROM projects WHERE id = a.entity_id)
        WHEN 'agent'   THEN (SELECT name  FROM agents   WHERE id = a.entity_id)
        ELSE NULL
      END AS entity_label
    FROM activity_log a
    ${whereSql}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  const total = (db.prepare(`SELECT COUNT(*) c FROM activity_log a ${whereSql}`).get(params) as { c: number }).c;

  return NextResponse.json({ activity: rows, total, limit, offset });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { entity_type, entity_id, action, actor, detail } = body as {
    entity_type?: string;
    entity_id?: number | null;
    action?: string;
    actor?: string;
    detail?: unknown;
  };

  if (!entity_type || !(VALID_ENTITY_TYPES as readonly string[]).includes(entity_type)) {
    return NextResponse.json({ error: `entity_type must be one of ${VALID_ENTITY_TYPES.join(', ')}` }, { status: 400 });
  }
  if (!action || !(VALID_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: `action must be one of ${VALID_ACTIONS.join(', ')}` }, { status: 400 });
  }
  if (!actor || typeof actor !== 'string' || !actor.trim()) {
    return NextResponse.json({ error: 'actor is required' }, { status: 400 });
  }

  const detailStr = typeof detail === 'string' ? detail : detail == null ? '' : JSON.stringify(detail);

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO activity_log (entity_type, entity_id, action, actor, detail)
    VALUES (?, ?, ?, ?, ?)
  `).run(entity_type, entity_id ?? null, action, actor.trim(), detailStr);

  const row = db.prepare('SELECT * FROM activity_log WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json({ activity: row }, { status: 201 });
}
