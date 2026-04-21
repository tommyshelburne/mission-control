import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const VALID_TYPES = ['info', 'warning', 'action_required', 'agent_update'] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unread') === '1' || searchParams.get('read') === '0';
  const typeFilter = searchParams.get('type');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 500);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10) || 0;

  const where: string[] = [];
  const params: Record<string, unknown> = { limit, offset };
  if (unreadOnly)  { where.push('read = 0'); }
  if (typeFilter)  { where.push('type = @type'); params.type = typeFilter; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const db = getDb();

  const rows = db.prepare(`
    SELECT * FROM notifications ${whereSql}
    ORDER BY created_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `).all(params);

  const total  = (db.prepare(`SELECT COUNT(*) c FROM notifications ${whereSql}`).get(params) as { c: number }).c;
  const unread = (db.prepare('SELECT COUNT(*) c FROM notifications WHERE read = 0').get() as { c: number }).c;

  return NextResponse.json({ notifications: rows, total, unread, limit, offset });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, body: text = '', type = 'info', source_agent, action_url } = body as {
    title?: string;
    body?: string;
    type?: string;
    source_agent?: string;
    action_url?: string;
  };

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!(VALID_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: `type must be one of ${VALID_TYPES.join(', ')}` }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO notifications (title, body, type, source_agent, action_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(title.trim(), text, type, source_agent ?? null, action_url ?? null);

  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json({ notification: row }, { status: 201 });
}
