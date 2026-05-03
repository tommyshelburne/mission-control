'use client';

import { useQuery } from '@tanstack/react-query';
import { Sparkles, TrendingUp, Database } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Spinner } from '@/components/ui';

interface AgentRow {
  agent: string;
  hits: number;
  misses: number;
  hit_rate: number | null;
  cost_saved_usd: number;
  cost_paid_usd: number;
  artifacts_cached: number;
  sample_size: number;
}

interface AnticipationResponse {
  agents: AgentRow[];
  fleet: { hits: number; misses: number; cost_saved_usd: number; cost_paid_usd: number };
  gate_threshold: number;
  updated_at: string;
}

const AGENT_COLORS: Record<string, string> = {
  warden: '#ef4444',
  quill:  '#ec4899',
  coach:  '#14b8a6',
};

function fmtUsd(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return '—';
  return `${(n * 100).toFixed(0)}%`;
}

export default function AnticipationPage() {
  const { data, isLoading } = useQuery<AnticipationResponse>({
    queryKey: ['anticipation'],
    queryFn: async () => (await fetch('/api/anticipation')).json(),
    refetchInterval: 10_000,
  });

  return (
    <>
      <PageHeader
        title="Anticipation"
        subtitle={data ? `${data.fleet.hits + data.fleet.misses} fleet-mediated requests · gate fires at ${data.gate_threshold}` : undefined}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size={20} />
        </div>
      ) : !data ? (
        <div className="text-[var(--text-secondary)] p-6">No anticipation data available.</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          {/* Fleet totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <FleetCard
              icon={<Sparkles size={14} />}
              label="Hit rate (fleet)"
              value={fmtPct(
                data.fleet.hits + data.fleet.misses > 0
                  ? data.fleet.hits / (data.fleet.hits + data.fleet.misses)
                  : null,
              )}
              hint={`${data.fleet.hits} hits / ${data.fleet.misses} misses`}
            />
            <FleetCard
              icon={<TrendingUp size={14} />}
              label="Cost saved on hits"
              value={fmtUsd(data.fleet.cost_saved_usd)}
              hint="sum of cached artifact cost_usd"
              positive={data.fleet.cost_saved_usd > 0}
            />
            <FleetCard
              icon={<Database size={14} />}
              label="Cost paid on misses"
              value={fmtUsd(data.fleet.cost_paid_usd)}
              hint="fresh LLM calls"
            />
          </div>

          {/* Per-agent rows */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <span style={{ fontSize: 12, fontWeight: 600 }} className="text-[var(--text-secondary)]">
                By agent
              </span>
            </div>
            <div>
              {data.agents.map((a) => (
                <AgentRowView key={a.agent} agent={a} gateThreshold={data.gate_threshold} />
              ))}
              {data.agents.length === 0 && (
                <div className="text-[var(--text-secondary)] p-6 text-center">
                  No tracked agents yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- subcomponents ---------- */

function FleetCard({
  icon, label, value, hint, positive,
}: { icon: React.ReactNode; label: string; value: string; hint: string; positive?: boolean }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center gap-1.5 text-[var(--text-muted)]" style={{ fontSize: 11 }}>
        {icon}<span>{label}</span>
      </div>
      <div
        className={positive ? 'text-emerald-500' : 'text-[var(--text-primary)]'}
        style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}
      >
        {value}
      </div>
      <div className="text-[var(--text-muted)]" style={{ fontSize: 11, marginTop: 2 }}>{hint}</div>
    </div>
  );
}

function AgentRowView({ agent, gateThreshold }: { agent: AgentRow; gateThreshold: number }) {
  const color = AGENT_COLORS[agent.agent] ?? 'var(--border-mid)';
  const total = agent.hits + agent.misses;
  const hitPct = total > 0 ? (agent.hits / total) * 100 : 0;
  const missPct = total > 0 ? (agent.misses / total) * 100 : 0;
  const gateMet = total >= gateThreshold;

  return (
    <div className="px-4 py-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-elevated)] transition-colors">
      <div className="flex items-center gap-3 mb-2">
        <span className="w-1 h-4 rounded-sm" style={{ backgroundColor: color }} />
        <span style={{ fontSize: 13, fontWeight: 600 }} className="text-[var(--text-primary)] flex-1">
          {agent.agent}
        </span>
        <span style={{ fontSize: 11 }} className="text-[var(--text-muted)]">
          {agent.artifacts_cached} cached
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 60, textAlign: 'right' }} className="text-[var(--text-primary)]">
          {fmtPct(agent.hit_rate)}
        </span>
        <span style={{ fontSize: 11, minWidth: 80, textAlign: 'right' }} className="text-emerald-500">
          {fmtUsd(agent.cost_saved_usd)} saved
        </span>
      </div>

      {/* Hit/miss bar */}
      <div className="relative h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden flex">
        <div
          className="h-full"
          style={{ width: `${hitPct}%`, backgroundColor: color }}
        />
        <div
          className="h-full opacity-30"
          style={{ width: `${missPct}%`, backgroundColor: color }}
        />
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        <span className="text-[var(--text-muted)]" style={{ fontSize: 10 }}>
          {agent.hits} hits · {agent.misses} misses
        </span>
        {!gateMet && (
          <span className="text-amber-500" style={{ fontSize: 10 }}>
            gate at {gateThreshold} events; have {total}
          </span>
        )}
        {gateMet && (
          <span className="text-emerald-500" style={{ fontSize: 10 }}>
            gate-eligible (sample ≥ {gateThreshold})
          </span>
        )}
      </div>
    </div>
  );
}
