'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Spinner } from '@/components/ui';

/* ---------- types ---------- */

interface ProviderTotals {
  turns: number;
  total_cost_usd: number;
  shadow_cost_usd: number;
}

interface AgentTotals {
  agent: string;
  total_cost_usd: number;
  shadow_cost_usd: number;
  total_savings_usd: number;
  turns: number;
  providers: Record<string, ProviderTotals>;
}

interface DailyRow {
  agent: string;
  day: string;
  provider: string;
  turns: number;
  total_cost_usd: number;
  shadow_cost_usd: number;
}

interface CostResponse {
  days: number;
  since: string;
  agents: AgentTotals[];
  fleet: { total_cost_usd: number; shadow_cost_usd: number; total_savings_usd: number; turns: number };
  daily: DailyRow[];
}

const AGENT_COLORS: Record<string, string> = {
  claw:         '#5b5bd6',
  'claw-planner': '#5b5bd6',
  rex:          '#22c55e',
  hermes:       '#06b6d4',
  quill:        '#ec4899',
  scout:        '#f59e0b',
  coach:        '#14b8a6',
  warden:       '#ef4444',
  herald:       '#8b5cf6',
  sage:         '#a855f7',
  pulse:        '#f43f5e',
  ledger:       '#eab308',
  main:         '#94a3b8',
};

/* ---------- helpers ---------- */

function fmtUsd(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/* ---------- component ---------- */

export default function CostsPage() {
  const { data, isLoading } = useQuery<CostResponse>({
    queryKey: ['cost-by-agent', 14],
    queryFn: async () => (await fetch('/api/cost-by-agent?days=14')).json(),
    refetchInterval: 60_000,
  });

  const maxAgentCost = useMemo(() => {
    if (!data?.agents.length) return 0;
    return Math.max(...data.agents.map((a) => Math.max(a.total_cost_usd, a.shadow_cost_usd)));
  }, [data]);

  return (
    <>
      <PageHeader
        title="Costs"
        subtitle={data ? `Last ${data.days} days · ${data.agents.length} agents` : undefined}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size={20} />
        </div>
      ) : !data ? (
        <div className="text-[var(--text-secondary)] p-6">No cost data available.</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          {/* Fleet totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <FleetCard
              icon={<DollarSign size={14} />}
              label="Fleet spend"
              value={fmtUsd(data.fleet.total_cost_usd)}
              hint={`${data.fleet.turns.toLocaleString()} turns`}
            />
            <FleetCard
              icon={<DollarSign size={14} />}
              label="Shadow cost (Pocketbook membership)"
              value={fmtUsd(data.fleet.shadow_cost_usd)}
              hint="What direct Anthropic would charge"
            />
            <FleetCard
              icon={<TrendingDown size={14} />}
              label="Membership savings"
              value={fmtUsd(data.fleet.total_savings_usd)}
              hint="shadow − actual"
              positive={data.fleet.total_savings_usd > 0}
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
                <AgentRow key={a.agent} agent={a} maxCost={maxAgentCost} />
              ))}
              {data.agents.length === 0 && (
                <div className="text-[var(--text-secondary)] p-6 text-center">
                  No rollup rows yet — wait for the next cron firing or run
                  {' '}<code className="text-[var(--text-primary)]">producer-cost-rollup.sh</code> manually.
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

function AgentRow({ agent, maxCost }: { agent: AgentTotals; maxCost: number }) {
  const color = AGENT_COLORS[agent.agent] ?? 'var(--border-mid)';
  const actualPct = maxCost > 0 ? (agent.total_cost_usd / maxCost) * 100 : 0;
  const shadowPct = maxCost > 0 ? (agent.shadow_cost_usd / maxCost) * 100 : 0;
  const providers = Object.entries(agent.providers).sort((a, b) => b[1].total_cost_usd - a[1].total_cost_usd);

  return (
    <div className="px-4 py-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-elevated)] transition-colors">
      <div className="flex items-center gap-3 mb-2">
        <span className="w-1 h-4 rounded-sm" style={{ backgroundColor: color }} />
        <span style={{ fontSize: 13, fontWeight: 600 }} className="text-[var(--text-primary)] flex-1">
          {agent.agent}
        </span>
        <span style={{ fontSize: 11 }} className="text-[var(--text-muted)]">
          {agent.turns.toLocaleString()} turns
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: 'right' }} className="text-[var(--text-primary)]">
          {fmtUsd(agent.total_cost_usd)}
        </span>
        {agent.total_savings_usd > 0 && (
          <span style={{ fontSize: 11, minWidth: 70, textAlign: 'right' }} className="text-emerald-500">
            saved {fmtUsd(agent.total_savings_usd)}
          </span>
        )}
      </div>

      {/* Cost bar (actual + shadow overlay if different) */}
      <div className="relative h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
        {agent.shadow_cost_usd > agent.total_cost_usd && (
          <div
            className="absolute top-0 left-0 h-full opacity-30"
            style={{ width: `${shadowPct}%`, backgroundColor: color }}
          />
        )}
        <div
          className="absolute top-0 left-0 h-full"
          style={{ width: `${actualPct}%`, backgroundColor: color }}
        />
      </div>

      {/* Provider breakdown */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {providers.map(([prov, p]) => (
          <span key={prov} className="text-[var(--text-muted)]" style={{ fontSize: 10 }}>
            {prov}: {p.turns} turns · {fmtUsd(p.total_cost_usd)}
            {prov === 'pocketbook' && p.shadow_cost_usd > 0 && (
              <span className="text-emerald-500"> (shadow {fmtUsd(p.shadow_cost_usd)})</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
