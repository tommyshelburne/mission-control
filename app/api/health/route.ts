import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const count = (t: string): number =>
    (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;

  const migrations = db
    .prepare('SELECT name FROM _migrations ORDER BY id')
    .all()
    .map((r) => (r as { name: string }).name);

  return NextResponse.json({
    status: 'ok',
    version: 'v4',
    time: new Date().toISOString(),
    counts: {
      tasks: count('tasks'),
      projects: count('projects'),
      opportunities: count('opportunities'),
      docs: count('docs'),
      agents: count('agents'),
      activity_log: count('activity_log'),
      notifications: count('notifications'),
      search_index: count('search_index'),
    },
    migrations,
  });
}
