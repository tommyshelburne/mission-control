import { getDb } from './db';
import { publishEvent } from './events';

export type EntityType = 'task' | 'project' | 'agent' | 'system';
export type Action = 'created' | 'updated' | 'status_changed' | 'commented' | 'deleted' | 'heartbeat';

interface LogActivityArgs {
  entity_type: EntityType;
  entity_id: number | null;
  action: Action;
  actor: string;
  detail?: unknown;
}

export async function logActivity({ entity_type, entity_id, action, actor, detail }: LogActivityArgs): Promise<void> {
  const db = getDb();
  const detailStr = typeof detail === 'string' ? detail : detail == null ? '' : JSON.stringify(detail);
  const result = db.prepare(
    `INSERT INTO activity_log (entity_type, entity_id, action, actor, detail)
     VALUES (?, ?, ?, ?, ?)`
  ).run(entity_type, entity_id, action, actor.trim(), detailStr);
  const row = db.prepare('SELECT * FROM activity_log WHERE id = ?').get(result.lastInsertRowid);
  await publishEvent('activity', row);
}
