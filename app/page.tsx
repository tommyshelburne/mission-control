'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useNow } from '@/lib/hooks';
import { Activity as ActivityIcon, AlertCircle, Calendar, UserPlus, Edit, Trash2, CheckSquare, Radio } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Spinner } from '@/components/ui';

/* ---------- types ---------- */

interface ActivityRow {
  id: number;
  entity_type: 'task' | 'project' | 'agent' | 'system';
  entity_id: number | null;
  action: string;
  actor: string;
  detail: string;
  created_at: string;
  entity_label: string | null;
}

interface Notification {
  id: number;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'action_required' | 'agent_update';
  source_agent: string | null;
  read: number;
  action_url: string | null;
  created_at: string;
}

interface Task {
  id: number;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  project: string;
}

/* ---------- helpers ---------- */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString();
}

function startOfDay(iso: string): string {
  return iso.slice(0, 10);
}

function dayLabel(ymd: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (ymd === today) return 'Today';
  const d = new Date(ymd + 'T00:00:00Z');
  const tdiff = Math.floor((Date.now() - d.getTime()) / 86400_000);
  if (tdiff === 1) return 'Yesterday';
  if (tdiff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const ACTION_ICON: Record<string, typeof CheckSquare> = {
  created:        UserPlus,
  updated:        Edit,
  status_changed: CheckSquare,
  commented:      Edit,
  deleted:        Trash2,
  heartbeat:      Radio,
};

const ACTION_COLOR: Record<string, string> = {
  created:        'var(--success)',
  status_changed: 'var(--accent)',
  commented:      'var(--text-secondary)',
  updated:        'var(--text-secondary)',
  deleted:        'var(--danger)',
  heartbeat:      'var(--text-muted)',
};

function entityHref(row: ActivityRow): string | null {
  if (row.entity_type === 'task' && row.entity_id) return `/tasks?task=${row.entity_id}`;
  if (row.entity_type === 'project' && row.entity_id) return `/projects?project=${row.entity_id}`;
  if (row.entity_type === 'agent') return '/team';
  return null;
}

function parseDetail(s: string): Record<string, unknown> | string {
  try { return JSON.parse(s); } catch { return s; }
}

function summarizeAction(row: ActivityRow): string {
  const d = parseDetail(row.detail);
  if (row.action === 'heartbeat' && typeof d === 'object' && d !== null) {
    const obj = d as { status?: string; currentActivity?: string };
    return obj.currentActivity ? `${obj.status} — ${obj.currentActivity}` : obj.status || 'heartbeat';
  }
  if (typeof d === 'string') return d;
  if (typeof d === 'object' && d !== null) {
    const obj = d as { text?: string };
    if (obj.text) return obj.text;
  }
  return row.action.replace('_', ' ');
}

/* ---------- component ---------- */

export default function HomePage() {
  const now = useNow();
  const { data: activityData, isLoading } = useQuery<{ activity: ActivityRow[] }>({
    queryKey: ['activity-home'],
    queryFn: async () => (await fetch('/api/activity?limit=100')).json(),
    refetchInterval: 30_000,
  });

  const { data: notifData } = useQuery<{ notifications: Notification[] }>({
    queryKey: ['notifications-actions'],
    queryFn: async () => (await fetch('/api/notifications?type=action_required&unread=1')).json(),
    refetchInterval: 30_000,
  });

  const { data: tasksData } = useQuery<{ tasks: Task[] }>({
    queryKey: ['tasks-all'],
    queryFn: async () => (await fetch('/api/tasks')).json(),
    refetchInterval: 60_000,
  });

  const dueSoon = useMemo(() => {
    const list = (tasksData?.tasks ?? [])
      .filter((t) => t.due_date && t.status !== 'done' && t.status !== 'archived')
      .map((t) => ({ ...t, dueMs: new Date(t.due_date!).getTime() }))
      .filter((t) => !isNaN(t.dueMs))
      .sort((a, b) => a.dueMs - b.dueMs);
    return list.filter((t) => t.dueMs <= now + 7 * 86400_000).slice(0, 6);
  }, [tasksData, now]);

  const activityByDay = useMemo(() => {
    const rows = activityData?.activity ?? [];
    const map: Record<string, ActivityRow[]> = {};
    for (const r of rows) {
      const day = startOfDay(r.created_at);
      (map[day] = map[day] || []).push(r);
    }
    return Object.entries(map).sort((a, b) => (a[0] > b[0] ? -1 : 1));
  }, [activityData]);

  return (
    <>
      <PageHeader title="Activity" subtitle="Live" />

      <div className="p-6 space-y-6 max-w-[900px]">
        {/* Action-required notifications */}
        {(notifData?.notifications?.length ?? 0) > 0 && (
          <section>
            <SectionHeading icon={AlertCircle} title="Needs your attention" />
            <div className="space-y-2">
              {notifData!.notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 p-3 rounded-md"
                  style={{ background: 'var(--danger-dim)', border: '1px solid rgba(240,68,68,0.2)' }}
                >
                  <AlertCircle size={14} style={{ color: 'var(--danger)', marginTop: 2 }} />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</div>
                    {n.body && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{n.body}</div>}
                    <div className="flex items-center gap-2 mt-1" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {n.source_agent && <span>{n.source_agent}</span>}
                      <span>·</span>
                      <span>{relativeTime(n.created_at)}</span>
                      {n.action_url && (
                        <Link href={n.action_url} style={{ color: 'var(--accent)', marginLeft: 'auto', textDecoration: 'none' }}>
                          Open →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Due soon */}
        {dueSoon.length > 0 && (
          <section>
            <SectionHeading icon={Calendar} title="Due this week" />
            <div
              className="rounded-md overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              {dueSoon.map((t, i) => {
                const overdue = t.dueMs < now;
                return (
                  <Link
                    key={t.id}
                    href={`/tasks?task=${t.id}`}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--bg-elevated)]"
                    style={{
                      borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                      textDecoration: 'none',
                    }}
                  >
                    <Badge variant={overdue ? 'danger' : 'warning'} size="xs" label={new Date(t.due_date!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }} className="truncate">
                      {t.title}
                    </span>
                    {t.project && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }} className="truncate">
                        {t.project}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Activity stream */}
        <section>
          <SectionHeading icon={ActivityIcon} title="Recent activity" />
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size={20} />
            </div>
          ) : activityByDay.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
              No activity yet.
            </div>
          ) : (
            activityByDay.map(([day, rows]) => (
              <div key={day} className="mb-4">
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 6,
                  }}
                >
                  {dayLabel(day)}
                </div>
                <div
                  className="rounded-md overflow-hidden"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  {rows.map((r, i) => (
                    <ActivityRow key={r.id} row={r} isFirst={i === 0} />
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: typeof CheckSquare; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon size={14} className="text-[var(--text-muted)]" />
      <h2 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
        {title}
      </h2>
    </div>
  );
}

function ActivityRow({ row, isFirst }: { row: ActivityRow; isFirst: boolean }) {
  const Icon = ACTION_ICON[row.action] ?? Edit;
  const color = ACTION_COLOR[row.action] ?? 'var(--text-muted)';
  const href = entityHref(row);
  const summary = summarizeAction(row);

  const body = (
    <div
      className="flex items-start gap-3 px-3 py-2"
      style={{ borderTop: isFirst ? 'none' : '1px solid var(--border)' }}
    >
      <Icon size={12} style={{ color, marginTop: 3, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13, color: 'var(--text-primary)' }} className="flex items-center gap-2">
          <span style={{ fontWeight: 500 }}>{row.actor}</span>
          <span style={{ color: 'var(--text-muted)' }}>{row.action.replace('_', ' ')}</span>
          {row.entity_label && (
            <span className="truncate">{row.entity_label}</span>
          )}
        </div>
        {summary && summary !== row.action.replace('_', ' ') && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }} className="truncate">
            {summary}
          </div>
        )}
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
        {relativeTime(row.created_at)}
      </span>
    </div>
  );

  return href ? (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }} className="hover:bg-[var(--bg-elevated)]">
      {body}
    </Link>
  ) : body;
}
