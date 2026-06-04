// Schema-parity guard (triage F10/F11). The test DB is hand-built in
// tests/helpers/test-db.ts rather than replayed from the migration chain (the
// chain assumes a v3 baseline fresh DBs don't have), so it can silently drift
// from production — which is exactly how `ticktick_id` vs `tick_tick_id` and a
// missing `depends_on` slipped in. This pins the test DB's column surface (what
// the API actually depends on) to production. CI now runs vitest, so any future
// column drift fails the build instead of producing confusing API-test errors.
//
// CANONICAL is the source of truth, derived from production. Regenerate with:
//   for t in tasks projects opportunities activity_log notifications docs agent_cost_daily; do
//     echo "$t: $(sqlite3 data/mc.db "SELECT group_concat(name,',') FROM pragma_table_info('$t')")"
//   done
import { describe, expect, it } from 'vitest';
import { makeTestDb } from '../helpers/test-db';

const CANONICAL: Record<string, string[]> = {
  tasks: ['id', 'title', 'description', 'status', 'priority', 'assignee', 'project_id', 'parent_id', 'due_date', 'tags', 'source', 'source_agent', 'position', 'completed_at', 'created_at', 'updated_at', 'dispatched_at', 'dispatch_envelope_id', 'depends_on'],
  projects: ['id', 'name', 'description', 'status', 'color', 'goal', 'due_date', 'icon', 'sort_order', 'created_at', 'updated_at'],
  opportunities: ['id', 'title', 'company', 'stage', 'source', 'location', 'salary_min', 'salary_max', 'url', 'contact', 'notes', 'next_action', 'next_action_date', 'applied_at', 'closed_reason', 'position', 'created_at', 'updated_at', 'tick_tick_id', 'applied_key', 'requires_login'],
  activity_log: ['id', 'entity_type', 'entity_id', 'action', 'actor', 'detail', 'created_at'],
  notifications: ['id', 'title', 'body', 'type', 'source_agent', 'read', 'action_url', 'created_at'],
  docs: ['id', 'title', 'category', 'file_path', 'content', 'preview', 'created_at', 'updated_at', 'author'],
  agent_cost_daily: ['agent', 'day', 'provider', 'turns', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'total_cost_usd', 'shadow_cost_usd', 'rolled_up_at'],
};

describe('test DB schema parity with production', () => {
  const db = makeTestDb();

  for (const [table, expected] of Object.entries(CANONICAL)) {
    it(`${table} has the production column set`, () => {
      const actual = (db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>).map((c) => c.name);
      // Compare as sets — order is deployment-specific (ALTER appends columns),
      // but a missing or extra column is real drift that breaks the API.
      expect([...actual].sort()).toEqual([...expected].sort());
    });
  }
});
