/**
 * Shared API DTOs imported by BOTH the route handler that emits them and the
 * client that renders them, so field names and types can't drift (the heartbeat
 * "Last seen: Never" bug was exactly this kind of drift — triage F3). Add new
 * response shapes here as they're standardized through v5.
 */

export type AgentPresence = 'idle' | 'busy' | 'offline';

/** Shape returned by GET /api/agents (one per Redis agent:<name>:state hash). */
export interface AgentDTO {
  name: string;
  /** Last self-reported status; may be stale. Prefer effective_status for display. */
  status: AgentPresence;
  /** Epoch-ms of the last heartbeat, or null if the agent has never reported. */
  last_heartbeat_ms: number | null;
  current_task_id: number | null;
  current_task_title: string | null;
  current_activity: string;
  model: string;
  /** now - last_heartbeat_ms, in seconds; null if never reported. */
  staleness_seconds: number | null;
  /** Server-derived: 'offline' if staleness exceeds the threshold, regardless of stored status. */
  effective_status: AgentPresence;
}
