'use client';

import { useEffect, useState, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, SlidePanel, EmptyState, Spinner } from '@/components/ui';

interface Deal {
  id: number;
  title: string;
  agency: string;
  stage_id: number;
  stage_name: string;
  status: string;
  value: number;
  add_time: string;
  update_time: string;
  next_activity_date: string | null;
  notes_count: number;
  isBidMatch: boolean;
  recommendation: string | null;
  score: number | null;
  naics: string;
  deadline: string;
  rationale: string;
  pipedrive_url: string;
}

const STAGE_OPTIONS = ['Qualified', 'Analyzing', 'Pursuing', 'Submitted', 'Under Review', 'Awarded'];
const REC_OPTIONS = ['PURSUE', 'PARTNER', 'PASS', 'MONITOR'];

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function scoreVariant(score: number): 'success' | 'warning' | 'muted' {
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'muted';
}

function recVariant(rec: string): 'success' | 'warning' | 'muted' {
  const r = rec.toUpperCase();
  if (r === 'PURSUE') return 'success';
  if (r === 'PARTNER') return 'warning';
  return 'muted';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PipelinePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState('');
  const [recFilter, setRecFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Deal | null>(null);

  useEffect(() => {
    fetch('/api/pipeline')
      .then((r) => r.json())
      .then((data) => {
        setDeals(data.deals || []);
        if (data.error) setError(data.error);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = deals;
    if (stageFilter) result = result.filter((d) => d.stage_name === stageFilter);
    if (recFilter) result = result.filter((d) => d.recommendation === recFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.agency.toLowerCase().includes(q)
      );
    }
    return result;
  }, [deals, stageFilter, recFilter, search]);

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle={loading ? 'Loading...' : `${deals.length} opportunities`}
      />

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[var(--border)]">
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 h-8 text-12 text-[var(--text-primary)] outline-none"
        >
          <option value="">All Stages</option>
          {STAGE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={recFilter}
          onChange={(e) => setRecFilter(e.target.value)}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 h-8 text-12 text-[var(--text-primary)] outline-none"
        >
          <option value="">All Recs</option>
          {REC_OPTIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search opportunities..."
          className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 h-8 text-12 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none w-56"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={20} />
          </div>
        ) : error && deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-14 font-medium text-[var(--text-primary)]">Failed to load pipeline</p>
            <p className="text-12 text-[var(--text-muted)]">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={32} />}
            title="No opportunities"
            subtitle="Pipeline is empty"
          />
        ) : (
          <div className="px-6">
            <table className="w-full">
              <thead>
                <tr style={{ height: 44, borderBottom: '1px solid var(--border-mid)' }}>
                  <th className="text-left w-[140px]" style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Agency</th>
                  <th className="text-left" style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Opportunity</th>
                  <th className="text-left w-[60px]" style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Score</th>
                  <th className="text-left w-[100px]" style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Stage</th>
                  <th className="text-left w-[90px]" style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Value</th>
                  <th className="text-left w-[90px]" style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Rec</th>
                  <th className="text-left w-[100px]" style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((deal) => (
                  <tr
                    key={deal.id}
                    onClick={() => setSelected(deal)}
                    className="hover:bg-[var(--bg-elevated)] cursor-pointer transition-colors duration-[80ms]"
                    style={{ height: 44, borderBottom: '1px solid var(--border)' }}
                  >
                    <td style={{ fontSize: 12, fontWeight: 500 }} className="text-[var(--text-primary)] truncate max-w-[140px]">{deal.agency || '--'}</td>
                    <td className="text-13 text-[var(--text-primary)] truncate max-w-0">{deal.title}</td>
                    <td>
                      {deal.score !== null ? (
                        <Badge label={String(deal.score)} variant={scoreVariant(deal.score)} size="xs" />
                      ) : (
                        <span className="text-12 text-[var(--text-muted)]">--</span>
                      )}
                    </td>
                    <td className="text-12 text-[var(--text-muted)]">{deal.stage_name}</td>
                    <td className="text-12 text-[var(--text-secondary)]">{deal.value ? formatCurrency(deal.value) : '--'}</td>
                    <td>
                      {deal.recommendation ? (
                        <Badge label={deal.recommendation} variant={recVariant(deal.recommendation)} size="xs" />
                      ) : (
                        <span className="text-12 text-[var(--text-muted)]">--</span>
                      )}
                    </td>
                    <td className="text-12 text-[var(--text-muted)]">{relativeTime(deal.update_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deal detail panel */}
      <SlidePanel open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div className="flex flex-col gap-6">
            {/* Title + agency + score */}
            <div>
              <h2 className="text-16 font-semibold text-[var(--text-primary)] leading-snug">{selected.title}</h2>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-12 text-[var(--text-secondary)]">{selected.agency || 'No agency'}</span>
                {selected.score !== null && (
                  <Badge label={`Score: ${selected.score}`} variant={scoreVariant(selected.score)} size="xs" />
                )}
              </div>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-y-4 gap-x-6">
              <div>
                <div className="text-11 text-[var(--text-muted)] mb-0.5">Stage</div>
                <div className="text-13 text-[var(--text-primary)]">{selected.stage_name}</div>
              </div>
              <div>
                <div className="text-11 text-[var(--text-muted)] mb-0.5">Value</div>
                <div className="text-13 text-[var(--text-primary)]">{selected.value ? formatCurrency(selected.value) : '--'}</div>
              </div>
              <div>
                <div className="text-11 text-[var(--text-muted)] mb-0.5">NAICS</div>
                <div className="text-13 text-[var(--text-primary)]">{selected.naics || '--'}</div>
              </div>
              <div>
                <div className="text-11 text-[var(--text-muted)] mb-0.5">Posted</div>
                <div className="text-13 text-[var(--text-primary)]">{formatDate(selected.add_time)}</div>
              </div>
              <div>
                <div className="text-11 text-[var(--text-muted)] mb-0.5">Deadline</div>
                <div className="text-13 text-[var(--text-primary)]">{selected.deadline ? formatDate(selected.deadline) : '--'}</div>
              </div>
              <div>
                <div className="text-11 text-[var(--text-muted)] mb-0.5">Status</div>
                <div className="text-13 text-[var(--text-primary)]">{selected.status}</div>
              </div>
            </div>

            {/* Recommendation */}
            {selected.recommendation && (
              <div>
                <div className="text-11 text-[var(--text-muted)] mb-1.5">Recommendation</div>
                <div className="flex items-start gap-2">
                  <Badge label={selected.recommendation} variant={recVariant(selected.recommendation)} />
                  {selected.rationale && (
                    <p className="text-13 text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">{selected.rationale}</p>
                  )}
                </div>
              </div>
            )}

            {/* Pipedrive link */}
            <a
              href={selected.pipedrive_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-12 text-[var(--accent)] hover:underline mt-2"
            >
              Open in Pipedrive &rarr;
            </a>
          </div>
        )}
      </SlidePanel>
    </>
  );
}
