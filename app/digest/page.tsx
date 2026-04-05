'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, StatusDot, Spinner } from '@/components/ui';

interface Task {
  id: number;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  project: string;
  due_date: string;
}

interface Escalation {
  date: string;
  level: string;
  title: string;
  body: string;
}

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
  lastRun: string;
}

interface DigestData {
  date: string;
  taskCounts: { status: string; count: number }[];
  overdueTasks: Task[];
  dueTodayTasks: Task[];
  inProgressTasks: Task[];
  blockedTasks: Task[];
  escalations: Escalation[];
  cronJobs: CronJob[];
  bidmatch: { running: boolean; enabled: boolean; detail: string };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function priorityColor(priority: string): string {
  switch (priority) {
    case 'urgent':
      return '#dc2626';
    case 'high':
      return '#f59e0b';
    default:
      return 'transparent';
  }
}

function escalationBorderColor(level: string): string {
  const upper = level.toUpperCase();
  if (upper === 'HIGH' || upper === 'CRITICAL') return 'var(--danger)';
  if (upper === 'WARN' || upper === 'MEDIUM' || upper === 'WARNING') return 'var(--warning)';
  return 'var(--accent)';
}

function escalationBadgeVariant(level: string): 'danger' | 'warning' | 'accent' {
  const upper = level.toUpperCase();
  if (upper === 'HIGH' || upper === 'CRITICAL') return 'danger';
  if (upper === 'WARN' || upper === 'MEDIUM' || upper === 'WARNING') return 'warning';
  return 'accent';
}

function TaskRow({ task }: { task: Task }) {
  return (
    <Link
      href="/tasks"
      className="flex items-center px-3 gap-2 hover:bg-[var(--bg-hover)] cursor-pointer"
      style={{ height: 36, transition: 'background 80ms ease', borderBottom: '1px solid var(--border)' }}
    >
      <span
        className="flex-shrink-0 rounded-full"
        style={{
          width: 5,
          height: 5,
          backgroundColor: priorityColor(task.priority),
        }}
      />
      <span
        style={{ fontSize: 12, fontWeight: 400 }}
        className="text-[var(--text-primary)] flex-1 truncate"
      >
        {task.title}
      </span>
      {task.project && (
        <Badge label={task.project} variant="neutral" size="xs" />
      )}
      {task.due_date && (
        <span className="text-11 text-[var(--text-muted)] flex-shrink-0">
          {formatShortDate(task.due_date)}
        </span>
      )}
    </Link>
  );
}


function EscalationsPanel({ escalations }: { escalations: Escalation[] }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors duration-[80ms] cursor-pointer"
      >
        <AlertTriangle size={13} className="text-[var(--warning)] flex-shrink-0" />
        <span className="text-13 font-semibold text-[var(--text-primary)] flex-1 text-left">Escalations</span>
        <Badge label={String(escalations.length)} variant="danger" size="xs" />
        <span className="ml-1 text-[var(--text-muted)]">
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>
      {!collapsed && (
        <div className="flex flex-col border-t border-[var(--border)]">
          {escalations.map((esc, i) => (
            <div
              key={i}
              className="pl-4 py-3 pr-4"
              style={{
                borderLeft: `2px solid ${escalationBorderColor(esc.level)}`,
                borderBottom: i < escalations.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div className="flex items-start gap-2">
                <Badge label={esc.level} variant={escalationBadgeVariant(esc.level)} size="xs" />
                <span className="text-13 font-medium text-[var(--text-primary)] flex-1">{esc.title}</span>
                <span className="text-11 text-[var(--text-muted)] flex-shrink-0">{esc.date}</span>
              </div>
              {esc.body && (
                <p className="text-12 text-[var(--text-secondary)] mt-1.5 leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
                  {esc.body}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DigestPage() {
  const router = useRouter();
  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [usageDollars, setUsageDollars] = useState<number | null | undefined>(undefined);

  const fetchDigest = useCallback(async () => {
    try {
      const res = await fetch('/api/digest');
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // Silently fail on fetch error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDigest();
    const interval = setInterval(fetchDigest, 60_000);
    return () => clearInterval(interval);
  }, [fetchDigest]);

  useEffect(() => {
    fetch('/api/usage')
      .then(r => r.json())
      .then(d => setUsageDollars(d.openrouter ?? null))
      .catch(() => setUsageDollars(null));
  }, []);

  const openCount =
    data?.taskCounts
      .filter((c) => c.status !== 'done')
      .reduce((sum, c) => sum + c.count, 0) ?? 0;

  const subtitle = data ? formatDate(data.date) : 'Loading...';

  return (
    <>
      <PageHeader
        title="Digest"
        subtitle={subtitle}
        actions={
          <button
            onClick={() => {
              setLoading(true);
              fetchDigest();
            }}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--bg-hover)]"
            style={{ transition: 'background 80ms ease' }}
            title="Refresh"
          >
            <RefreshCw
              size={14}
              className={`text-[var(--text-muted)] ${loading ? 'animate-spin' : ''}`}
            />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={20} />
          </div>
        ) : data ? (
          <div className="flex flex-col gap-6 max-w-[1080px]">
            {/* Stat strip */}
            <div className="grid grid-cols-5 gap-3">
              <StatCard
                label="Overdue"
                count={data.overdueTasks.length}
                color="var(--danger)"
                onClick={() => router.push('/tasks')}
              />
              <StatCard
                label="Due Today"
                count={data.dueTodayTasks.length}
                color="var(--warning)"
                onClick={() => router.push('/tasks')}
              />
              <StatCard
                label="In Progress"
                count={data.inProgressTasks.length}
                color="var(--accent)"
                onClick={() => router.push('/tasks')}
              />
              <StatCard
                label="Blocked"
                count={data.blockedTasks.length}
                color="var(--danger)"
                onClick={() => router.push('/tasks')}
              />
              <StatCard
                label="Open Total"
                count={openCount}
                color="var(--text-secondary)"
                onClick={() => router.push('/tasks')}
              />
            </div>

            {/* Escalations panel */}
            {data.escalations.length > 0 && (
              <EscalationsPanel escalations={data.escalations} />
            )}

            {/* Task grids */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="flex items-center px-4 border-b border-[var(--border)]" style={{ height: 40 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 600 }} className="text-[var(--text-primary)]">
                    Overdue
                    <span className="text-[var(--text-muted)] font-normal ml-1.5">{data.overdueTasks.length}</span>
                  </h3>
                  {data.overdueTasks.length > 8 && (
                    <Link href="/tasks" className="text-11 text-[var(--accent)] hover:underline ml-auto">View all &rarr;</Link>
                  )}
                </div>
                <div>
                  {data.overdueTasks.length === 0 ? (
                    <p className="text-12 text-[var(--text-muted)] px-3 py-2">No tasks</p>
                  ) : (
                    data.overdueTasks.slice(0, 8).map(t => <TaskRow key={t.id} task={t} />)
                  )}
                </div>
              </div>
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="flex items-center px-4 border-b border-[var(--border)]" style={{ height: 40 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 600 }} className="text-[var(--text-primary)]">
                    Due Today
                    <span className="text-[var(--text-muted)] font-normal ml-1.5">{data.dueTodayTasks.length}</span>
                  </h3>
                </div>
                <div>
                  {data.dueTodayTasks.length === 0 ? (
                    <p className="text-12 text-[var(--text-muted)] px-3 py-2">No tasks</p>
                  ) : (
                    data.dueTodayTasks.map(t => <TaskRow key={t.id} task={t} />)
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="flex items-center px-4 border-b border-[var(--border)]" style={{ height: 40 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 600 }} className="text-[var(--text-primary)]">
                    In Progress
                    <span className="text-[var(--text-muted)] font-normal ml-1.5">{data.inProgressTasks.length}</span>
                  </h3>
                  {data.inProgressTasks.length > 6 && (
                    <Link href="/tasks" className="text-11 text-[var(--accent)] hover:underline ml-auto">View all &rarr;</Link>
                  )}
                </div>
                <div>
                  {data.inProgressTasks.length === 0 ? (
                    <p className="text-12 text-[var(--text-muted)] px-3 py-2">No tasks</p>
                  ) : (
                    data.inProgressTasks.slice(0, 6).map(t => <TaskRow key={t.id} task={t} />)
                  )}
                </div>
              </div>
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="flex items-center px-4 border-b border-[var(--border)]" style={{ height: 40 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 600 }} className="text-[var(--text-primary)]">
                    Blocked
                    <span className="text-[var(--text-muted)] font-normal ml-1.5">{data.blockedTasks.length}</span>
                  </h3>
                </div>
                <div>
                  {data.blockedTasks.length === 0 ? (
                    <p className="text-12 text-[var(--text-muted)] px-3 py-2">No tasks</p>
                  ) : (
                    data.blockedTasks.map(t => <TaskRow key={t.id} task={t} />)
                  )}
                </div>
              </div>
            </div>

            {/* Bottom row: BidMatch + Cron Jobs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 border-b border-[var(--border)]" style={{ height: 40 }}>
                  <StatusDot
                    status={data.bidmatch.running ? 'active' : 'error'}
                  />
                  <h3 style={{ fontSize: 12, fontWeight: 600 }} className="text-[var(--text-primary)]">
                    BidMatch
                  </h3>
                </div>
                <div className="px-4 py-3">
                  <p className="text-12 text-[var(--text-secondary)]">
                    {data.bidmatch.detail}
                  </p>
                </div>
              </div>

              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="flex items-center px-4 border-b border-[var(--border)]" style={{ height: 40 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 600 }} className="text-[var(--text-primary)]">
                    Upcoming Cron Jobs
                  </h3>
                </div>
                <div className="px-4 py-2">
                  {data.cronJobs.length === 0 ? (
                    <p className="text-12 text-[var(--text-muted)]">
                      No cron jobs configured
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {data.cronJobs.slice(0, 6).map((job) => (
                        <div
                          key={job.id}
                          className="flex items-center gap-2 py-1"
                        >
                          <span className="text-12 text-[var(--text-primary)] flex-1 truncate">
                            {job.name}
                          </span>
                          <span
                            className="text-11 text-[var(--text-muted)] flex-shrink-0"
                            style={{ fontFamily: 'monospace' }}
                          >
                            {job.schedule}
                          </span>
                          <Badge
                            label={job.enabled ? 'on' : 'off'}
                            variant={job.enabled ? 'success' : 'muted'}
                            size="xs"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Usage */}
            {usageDollars !== undefined && (
              <div
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg flex items-center gap-6 px-4"
                style={{ height: 44 }}
              >
                <span style={{ fontSize: 11, fontWeight: 600 }} className="text-[var(--text-muted)] uppercase tracking-wide">Usage</span>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 11 }} className="text-[var(--text-muted)]">OpenRouter (today)</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }} className="text-[var(--text-primary)]">
                      {usageDollars !== null ? `$${usageDollars.toFixed(4)}` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 11 }} className="text-[var(--text-muted)]">Anthropic</span>
                    <a
                      href="https://console.anthropic.com/usage"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 11 }}
                      className="text-[var(--accent)] hover:underline"
                    >
                      View Console →
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[var(--text-muted)]">Failed to load digest.</p>
        )}
      </div>
    </>
  );
}

function StatCard({
  label,
  count,
  color,
  onClick,
}: {
  label: string;
  count: number;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md p-4 text-left cursor-pointer hover:bg-[var(--bg-hover)]"
      style={{ transition: 'all 80ms ease' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${color} 40%, transparent)`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color }}>
        {count}
      </div>
      <div style={{ fontSize: 11, fontWeight: 400, marginTop: 6 }} className="text-[var(--text-muted)]">{label}</div>
    </button>
  );
}
