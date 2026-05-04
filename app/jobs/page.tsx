'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, EmptyState, Spinner, Button } from '@/components/ui';
import { Briefcase, ExternalLink } from 'lucide-react';

const TICKTICK_URL = 'https://ticktick.com';

/* ---------- types ---------- */

interface JobCard {
  id: string;
  company: string;
  role: string;
  title: string;
  tags: string[];
  dueDate: string;
  priority: number;
  status: string;
  url: string;
}

interface JobsResponse {
  jobs: JobCard[];
  columns: string[];
  lastUpdated?: string;
  error?: string;
}

interface AppliedEntry {
  key: string;
  company: string;
  title: string;
  applied_date: string;
  source: string;
  outcome: string;
  url?: string;
  notes?: string;
  evidence?: string[];
}

interface AppliedResponse {
  entries: AppliedEntry[];
  lastUpdated?: string | null;
  count: number;
  error?: string;
}

type View = 'pipeline' | 'applied';

const OUTCOME_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'neutral' | 'accent' | 'muted'> = {
  open: 'accent',
  in_progress: 'neutral',
  interviewing: 'warning',
  offer: 'success',
  rejected: 'danger',
  ghosted: 'muted',
  withdrew: 'muted',
};

/* ---------- helpers ---------- */

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTimestamp(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/* ---------- component ---------- */

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('pipeline');
  const [applied, setApplied] = useState<AppliedEntry[]>([]);
  const [appliedUpdated, setAppliedUpdated] = useState<string | null>(null);
  const [appliedError, setAppliedError] = useState('');

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/jobs');
      const data: JobsResponse = await res.json();
      setJobs(data.jobs || []);
      setColumns(data.columns || []);
      setLastUpdated(data.lastUpdated || '');
      setError(data.error || '');
    } catch {
      setError('Failed to fetch jobs');
      setColumns(['Applying', 'Applied', 'Interview', 'Offer', 'Archived']);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchApplied = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs/applied');
      const data: AppliedResponse = await res.json();
      setApplied(data.entries || []);
      setAppliedUpdated(data.lastUpdated ?? null);
      setAppliedError(data.error || '');
    } catch {
      setAppliedError('Failed to fetch applied ledger');
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchApplied();
  }, [fetchJobs, fetchApplied]);

  const grouped = columns.reduce<Record<string, JobCard[]>>((acc, col) => {
    acc[col] = jobs.filter((j) => j.status === col);
    return acc;
  }, {});

  const subtitle =
    view === 'pipeline'
      ? lastUpdated
        ? `Updated ${formatTimestamp(lastUpdated)} · sourced from TickTick`
        : 'sourced from TickTick'
      : appliedUpdated
        ? `Updated ${formatShortDate(appliedUpdated)} · master ledger (warden dedup source)`
        : 'master ledger (warden dedup source)';

  const tabBtn = (key: View, label: string, count: number) => (
    <button
      key={key}
      onClick={() => setView(key)}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-12"
      style={{
        background:
          view === key ? 'var(--bg-elevated)' : 'transparent',
        color:
          view === key
            ? 'var(--text-primary)'
            : 'var(--text-muted)',
        border: '1px solid',
        borderColor:
          view === key ? 'var(--border-mid)' : 'transparent',
        transition: 'all 80ms',
      }}
    >
      {label}
      <Badge label={String(count)} variant="neutral" size="xs" />
    </button>
  );

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            {tabBtn('pipeline', 'Pipeline', jobs.length)}
            {tabBtn('applied', 'Applied', applied.length)}
            {loading && view === 'pipeline' && <Spinner size={14} />}
            <Button
              variant="ghost"
              size="sm"
              icon={<ExternalLink size={12} />}
              onClick={() => window.open(TICKTICK_URL, '_blank')}
              title="Open TickTick (jobs are managed there)"
            >
              TickTick
            </Button>
          </div>
        }
      />

      {view === 'pipeline' && error && (
        <div className="mx-6 mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-12 text-[var(--text-secondary)]">{error}</p>
        </div>
      )}

      {view === 'applied' && appliedError && (
        <div className="mx-6 mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-12 text-[var(--text-secondary)]">{appliedError}</p>
        </div>
      )}

      {view === 'applied' && (
        <div className="flex-1 overflow-y-auto p-6">
          {applied.length === 0 ? (
            <EmptyState
              icon={<Briefcase size={32} />}
              title="No applications logged"
              subtitle={
                <span>
                  Run{' '}
                  <code className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-11">
                    backfill-applied.py --apply
                  </code>{' '}
                  in <code>projects/job-search/</code>
                </span>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
              <table className="w-full text-12">
                <thead>
                  <tr
                    className="text-[var(--text-muted)]"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      fontSize: 11,
                      letterSpacing: '0.06em',
                    }}
                  >
                    <th className="px-4 py-2.5 text-left uppercase">Company</th>
                    <th className="px-4 py-2.5 text-left uppercase">Role</th>
                    <th className="px-4 py-2.5 text-left uppercase">Applied</th>
                    <th className="px-4 py-2.5 text-left uppercase">Source</th>
                    <th className="px-4 py-2.5 text-left uppercase">Outcome</th>
                    <th className="px-4 py-2.5 text-left uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {applied.map((entry) => {
                    const variant =
                      OUTCOME_VARIANT[entry.outcome] ?? 'neutral';
                    return (
                      <tr
                        key={entry.key}
                        className="hover:bg-[var(--bg-elevated)]"
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">
                          {entry.url ? (
                            <a
                              href={entry.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-[var(--accent)] hover:underline"
                            >
                              {entry.company}
                            </a>
                          ) : (
                            entry.company
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                          {entry.title || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">
                          {formatShortDate(entry.applied_date)}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--text-muted)]">
                          {entry.source || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge
                            label={entry.outcome || 'open'}
                            variant={variant}
                            size="xs"
                          />
                        </td>
                        <td
                          className="px-4 py-2.5 text-[var(--text-muted)]"
                          style={{ maxWidth: 320 }}
                        >
                          <div
                            className="overflow-hidden text-ellipsis"
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                            title={entry.notes || ''}
                          >
                            {entry.notes || ''}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'pipeline' && !loading && jobs.length === 0 && !error && (
        <EmptyState
          icon={<Briefcase size={32} />}
          title="No active job leads"
          subtitle={
            <>
              Add them in{' '}
              <a
                href={TICKTICK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                TickTick
              </a>
            </>
          }
        />
      )}

      {view === 'pipeline' && (jobs.length > 0 || loading) && (
        <div className="flex flex-row gap-3 overflow-x-auto p-6 flex-1">
          {columns.map((col) => (
            <div
              key={col}
              className="flex flex-col w-[300px] min-w-[300px] flex-shrink-0 gap-2"
            >
              {/* column header */}
              <div className="flex items-center gap-2 mb-2 pb-2" style={{ height: 36, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em' }} className="uppercase text-[var(--text-muted)]">
                  {col}
                </span>
                <Badge
                  label={String(grouped[col]?.length || 0)}
                  variant="neutral"
                  size="xs"
                />
              </div>

              {/* column body */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
                {grouped[col]?.map((job) => (
                  <div
                    key={job.id}
                    className={`group relative bg-[var(--bg-card)] border border-[var(--border)] rounded-md hover:border-[var(--border-mid)] hover:bg-[var(--bg-elevated)] flex flex-col gap-1 ${
                      job.url ? 'cursor-pointer' : 'cursor-default'
                    }`}
                    style={{ padding: '10px 12px', minHeight: 64, borderRadius: 'var(--radius-md)', transition: 'all 80ms' }}
                    onClick={() => {
                      if (job.url) window.open(job.url, '_blank');
                    }}
                  >
                    {/* priority dot */}
                    {job.priority >= 5 && (
                      <span
                        className="absolute rounded-full"
                        style={{ top: 10, right: 10, width: 7, height: 7, backgroundColor: '#dc2626' }}
                        title="High priority"
                      />
                    )}

                    {/* external-link affordance — visible on hover */}
                    {job.url && (
                      <ExternalLink
                        size={10}
                        className="absolute text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ bottom: 8, right: 10 }}
                      />
                    )}

                    {/* row 1: company */}
                    <div className="text-[var(--text-primary)] overflow-hidden" style={{ fontSize: 13, fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.3 }}>
                      {job.company}
                    </div>

                    {/* row 2: role */}
                    {job.role && (
                      <div className="text-12 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-secondary)]">
                        {job.role}
                      </div>
                    )}

                    {/* row 3: tags + date — only render if there's content */}
                    {(job.tags.length > 0 || job.dueDate) && (
                      <div className="flex items-center gap-1.5 mt-auto pt-1">
                        {job.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            style={{
                              fontSize: 10,
                              background: 'var(--bg-elevated)',
                              color: 'var(--text-muted)',
                              borderRadius: 'var(--radius-xs)',
                              padding: '2px 6px',
                            }}
                            className="whitespace-nowrap"
                          >
                            {tag}
                          </span>
                        ))}
                        <span className="flex-1" />
                        {job.dueDate && (
                          <span style={{ fontSize: 11 }} className="text-[var(--text-muted)] whitespace-nowrap pr-3">
                            {formatShortDate(job.dueDate)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
