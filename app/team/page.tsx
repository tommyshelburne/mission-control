'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, StatusDot, Spinner } from '@/components/ui';

/* ---------- types ---------- */

interface Agent {
  id: number;
  name: string;
  status: 'idle' | 'busy' | 'offline';
  effective_status: 'idle' | 'busy' | 'offline';
  current_task_id: number | null;
  current_task_title: string | null;
  current_activity: string;
  model: string;
  last_heartbeat: string | null;
  staleness_seconds: number | null;
  updated_at: string;
}

interface ActivityRow {
  id: number;
  entity_type: string;
  entity_id: number | null;
  action: string;
  actor: string;
  detail: string;
  created_at: string;
  entity_label: string | null;
}

interface AgentMeta {
  role: string;
  color: string;
}

const AGENT_META: Record<string, AgentMeta> = {
  tommy:  { role: 'Human · Owner',          color: '#3b82f6' },
  claw:   { role: 'Chief of Staff',         color: '#5b5bd6' },
  rex:    { role: 'Head Engineer',          color: '#22c55e' },
  hermes: { role: 'Research / Reasoning',   color: '#06b6d4' },
  quill:  { role: 'Writer',                 color: '#ec4899' },
  scout:  { role: 'Researcher',             color: '#f59e0b' },
  coach:  { role: 'Interview Prep',         color: '#14b8a6' },
  warden: { role: 'Oversight / Monitor',    color: '#ef4444' },
  herald: { role: 'Morning Brief',          color: '#8b5cf6' },
  sage:   { role: 'Skill Curriculum',       color: '#a855f7' },
  pulse:  { role: 'Network & Community',    color: '#f43f5e' },
  ledger: { role: 'Runway & Finance',       color: '#eab308' },
};

/* ---------- helpers ---------- */

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function statusDotStatus(s: Agent['effective_status']): 'active' | 'idle' | 'error' | 'unknown' {
  if (s === 'busy') return 'active';
  if (s === 'idle') return 'idle';
  return 'unknown';
}

function actionLabel(action: string): string {
  if (action === 'status_changed') return 'status changed';
  return action;
}

/* ---------- component ---------- */

export default function TeamPage() {
  const { data: agentsData, isLoading: agentsLoading } = useQuery<{ agents: Agent[] }>({
    queryKey: ['agents'],
    queryFn: async () => (await fetch('/api/agents')).json(),
    refetchInterval: 30_000,
  });

  const { data: activityData } = useQuery<{ activity: ActivityRow[] }>({
    queryKey: ['activity-recent'],
    queryFn: async () => (await fetch('/api/activity?limit=200')).json(),
    refetchInterval: 30_000,
  });

  const activityByActor = useMemo(() => {
    const map: Record<string, ActivityRow[]> = {};
    for (const row of activityData?.activity ?? []) {
      if (!map[row.actor]) map[row.actor] = [];
      if (map[row.actor].length < 5) map[row.actor].push(row);
    }
    return map;
  }, [activityData]);

  const agents = agentsData?.agents ?? [];

  // Tommy is not in the agents table; synthesize an entry.
  const tommyCard: Agent = {
    id: -1,
    name: 'tommy',
    status: 'idle',
    effective_status: 'idle',
    current_task_id: null,
    current_task_title: null,
    current_activity: '',
    model: '',
    last_heartbeat: null,
    staleness_seconds: null,
    updated_at: '',
  };

  return (
    <>
      <PageHeader
        title="Agents"
        subtitle={!agentsLoading ? `${agents.length + 1} members` : undefined}
      />

      {agentsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size={20} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            <AgentCard agent={tommyCard} activity={[]} />
            {agents.map((a) => (
              <AgentCard key={a.name} agent={a} activity={activityByActor[a.name] ?? []} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- agent card ---------- */

function AgentCard({ agent, activity }: { agent: Agent; activity: ActivityRow[] }) {
  const meta = AGENT_META[agent.name] ?? { role: '—', color: 'var(--border-mid)' };
  const isTommy = agent.name === 'tommy';
  const displayName = agent.name.charAt(0).toUpperCase() + agent.name.slice(1);

  const statusBadgeVariant: Record<Agent['effective_status'], 'success' | 'neutral' | 'muted'> = {
    busy:    'success',
    idle:    'neutral',
    offline: 'muted',
  };

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden hover:border-[var(--border-mid)] transition-all duration-[80ms]">
      <div className="h-[2px]" style={{ backgroundColor: meta.color }} />

      <div className="p-4">
        {/* Row 1: icon + name + status badge */}
        <div className="flex items-center gap-2">
          {isTommy ? (
            <User size={14} className="text-[var(--text-muted)] flex-shrink-0" />
          ) : (
            <StatusDot status={statusDotStatus(agent.effective_status)} />
          )}
          <span style={{ fontSize: 14, fontWeight: 600 }} className="text-[var(--text-primary)] flex-1 truncate">
            {displayName}
          </span>
          {!isTommy && (
            <Badge variant={statusBadgeVariant[agent.effective_status]} size="xs" label={agent.effective_status} />
          )}
        </div>

        {/* Row 2: role */}
        <div style={{ fontSize: 12 }} className="text-[var(--text-secondary)] mt-0.5 ml-[22px]">
          {meta.role}
        </div>

        {/* Row 3: model */}
        {!isTommy && agent.model && (
          <div style={{ fontSize: 11, fontFamily: "'SF Mono', 'Fira Code', monospace" }} className="text-[var(--text-muted)] mt-3 ml-[22px] truncate">
            {agent.model}
          </div>
        )}

        {/* Row 4: current activity */}
        {!isTommy && agent.current_activity && (
          <div style={{ fontSize: 11 }} className="text-[var(--text-secondary)] mt-2 ml-[22px]">
            <span style={{ color: 'var(--text-muted)' }}>now:</span> {agent.current_activity}
            {agent.current_task_title && (
              <span style={{ color: 'var(--text-muted)' }}> — {agent.current_task_title}</span>
            )}
          </div>
        )}

        {/* Row 5: last heartbeat */}
        {!isTommy && (
          <div style={{ fontSize: 11 }} className="text-[var(--text-muted)] mt-1 ml-[22px]">
            Last seen: {relativeTime(agent.last_heartbeat)}
          </div>
        )}

        {/* Row 6: recent activity */}
        {!isTommy && activity.length > 0 && (
          <div className="mt-3 ml-[22px] pt-3 border-t border-[var(--border)]">
            <div style={{ fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }} className="text-[var(--text-muted)] mb-1.5">
              Recent
            </div>
            <div className="space-y-1">
              {activity.map((row) => (
                <div key={row.id} style={{ fontSize: 11 }} className="text-[var(--text-secondary)] flex items-baseline gap-2">
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                    {relativeTime(row.created_at)}
                  </span>
                  <span className="truncate">
                    {actionLabel(row.action)}
                    {row.entity_label && <span style={{ color: 'var(--text-muted)' }}> · {row.entity_label}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
