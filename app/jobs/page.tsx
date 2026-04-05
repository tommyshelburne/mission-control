'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, EmptyState, Spinner } from '@/components/ui';
import { Briefcase } from 'lucide-react';

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

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const grouped = columns.reduce<Record<string, JobCard[]>>((acc, col) => {
    acc[col] = jobs.filter((j) => j.status === col);
    return acc;
  }, {});

  const subtitle = lastUpdated
    ? `Updated ${formatTimestamp(lastUpdated)}`
    : undefined;

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle={subtitle}
        actions={
          loading ? (
            <Spinner size={14} />
          ) : (
            <Badge
              label={`${jobs.length} leads`}
              variant="neutral"
              size="xs"
            />
          )
        }
      />

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-12 text-[var(--text-secondary)]">{error}</p>
        </div>
      )}

      {!loading && jobs.length === 0 && !error && (
        <EmptyState
          icon={<Briefcase size={32} />}
          title="No active job leads"
          subtitle="Add them in TickTick"
        />
      )}

      {(jobs.length > 0 || loading) && (
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
                    className={`relative bg-[var(--bg-card)] border border-[var(--border)] rounded-md hover:border-[var(--border-mid)] hover:bg-[var(--bg-elevated)] flex flex-col ${
                      job.url ? 'cursor-pointer' : 'cursor-default'
                    }`}
                    style={{ padding: '12px 14px', height: 96, borderRadius: 'var(--radius-md)', transition: 'all 80ms' }}
                    onClick={() => {
                      if (job.url) window.open(job.url, '_blank');
                    }}
                  >
                    {/* priority dot */}
                    {job.priority >= 5 && (
                      <span
                        className="absolute rounded-full"
                        style={{ top: 10, right: 10, width: 7, height: 7, backgroundColor: '#dc2626' }}
                      />
                    )}

                    {/* row 1: company */}
                    <div className="text-[var(--text-primary)] overflow-hidden" style={{ fontSize: 13, fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {job.company}
                    </div>

                    {/* row 2: role */}
                    {job.role && (
                      <div className="text-12 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-secondary)]">
                        {job.role}
                      </div>
                    )}

                    {/* row 3: tags + date */}
                    <div className="flex items-center gap-1.5 mt-auto">
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
                        <span style={{ fontSize: 11 }} className="text-[var(--text-muted)] whitespace-nowrap">
                          {formatShortDate(job.dueDate)}
                        </span>
                      )}
                    </div>
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
