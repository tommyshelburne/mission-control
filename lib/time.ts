/**
 * Single relative-time formatter for the whole app. Accepts either an epoch-ms
 * number (e.g. agent last_heartbeat_ms) or an ISO/SQLite datetime string (e.g.
 * activity_log.created_at, stored as 'YYYY-MM-DD HH:MM:SS' in UTC). Returns
 * 'Never' for null/undefined/unparseable input.
 *
 * Replaces the per-page reimplementations that re-parsed strings and disagreed
 * on the input type — the root of the heartbeat "Last seen: Never" bug, where
 * the API emitted epoch-ms but the page parsed it as a string (triage F3).
 */
export function relativeTime(input: number | string | null | undefined): string {
  if (input == null) return 'Never';
  const t =
    typeof input === 'number'
      ? input
      : new Date(input.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(input) ? '' : 'Z')).getTime();
  if (Number.isNaN(t)) return 'Never';

  const secs = Math.floor((Date.now() - t) / 1000);
  if (secs < 0) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Day-granular relative label for a 'YYYY-MM-DD' date (UTC). 'today' /
 *  'yesterday' / 'Nd ago' / 'never'. Used for cost-rollup last-active days. */
export function relativeDay(ymd: string | null | undefined): string {
  if (!ymd) return 'never';
  const d = new Date(ymd + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return 'never';
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((todayUtc - d.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}
