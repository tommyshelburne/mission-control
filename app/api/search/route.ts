import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type EntityType = 'task' | 'project' | 'doc' | 'opportunity';

const HREF: Record<EntityType, (id: number) => string> = {
  task:        (id) => `/tasks?task=${id}`,
  project:     (id) => `/projects?project=${id}`,
  doc:         (id) => `/docs?doc=${id}`,
  opportunity: (id) => `/pipeline?opp=${id}`,
};

// Escape FTS5 special chars and wrap each token as a prefix match ("foo" → "foo*")
// so incremental typing finds partial matches.
function buildFtsQuery(q: string): string {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => tok.replace(/["\\()]/g, ' ').trim())
    .filter((tok) => tok.length > 0)
    .map((tok) => `"${tok}"*`)
    .join(' ');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 50);

  if (!q) {
    return NextResponse.json({ results: [], total: 0, q: '' });
  }

  const ftsQuery = buildFtsQuery(q);
  if (!ftsQuery) {
    return NextResponse.json({ results: [], total: 0, q });
  }

  const db = getDb();
  try {
    const rows = db
      .prepare(
        `SELECT entity_type, entity_id, title,
           snippet(search_index, 3, '<mark>', '</mark>', '…', 8) AS snippet,
           rank
         FROM search_index
         WHERE search_index MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(ftsQuery, limit) as Array<{
        entity_type: EntityType;
        entity_id: number;
        title: string;
        snippet: string;
        rank: number;
      }>;

    const results = rows.map((r) => ({
      ...r,
      href: HREF[r.entity_type]?.(r.entity_id) ?? '/',
    }));

    return NextResponse.json({ results, total: results.length, q });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ results: [], total: 0, q, error: msg }, { status: 400 });
  }
}
