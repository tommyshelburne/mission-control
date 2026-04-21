import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const { read } = body as { read?: boolean | number };

  if (read === undefined) {
    return NextResponse.json({ error: 'Only `read` field is updatable' }, { status: 400 });
  }

  const db = getDb();
  const readValue = read ? 1 : 0;
  db.prepare('UPDATE notifications SET read = ? WHERE id = ?').run(readValue, params.id);

  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(params.id);
  if (!row) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  return NextResponse.json({ notification: row });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const info = db.prepare('DELETE FROM notifications WHERE id = ?').run(params.id);
  if (info.changes === 0) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
