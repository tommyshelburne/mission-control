'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, StatusDot, Spinner } from '@/components/ui';

/* ---------- types ---------- */

interface TeamMember {
  key: string;
  name: string;
  role: string;
  model: string;
  status: 'active' | 'idle' | 'error' | 'unknown';
  last_run: string | null;
  inbox_pending: number;
  skills: string[];
  color: string;
}

/* ---------- helpers ---------- */

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const statusVariant: Record<TeamMember['status'], 'success' | 'neutral' | 'danger' | 'muted'> = {
  active:  'success',
  idle:    'neutral',
  error:   'danger',
  unknown: 'muted',
};

/* ---------- component ---------- */

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch('/api/team');
      const data = await res.json();
      setTeam(data.team || []);
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  return (
    <>
      <PageHeader
        title="Agents"
        subtitle={team.length > 0 ? `${team.length} members` : undefined}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size={20} />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 p-6">
          {team.map((agent) => (
            <AgentCard key={agent.key} agent={agent} />
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- agent card ---------- */

function AgentCard({ agent }: { agent: TeamMember }) {
  const isTommy = agent.key === 'tommy';

  return (
    <div
      className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden hover:border-[var(--border-mid)] transition-all duration-[80ms]"
    >
      {/* Top accent border */}
      <div className="h-[2px]" style={{ backgroundColor: agent.color }} />

      {/* Card body */}
      <div className="p-4">
        {/* Row 1: icon + name + inbox badge */}
        <div className="flex items-center gap-2">
          {isTommy ? (
            <User size={14} className="text-[var(--text-muted)] flex-shrink-0" />
          ) : (
            <StatusDot status={agent.status} />
          )}
          <span style={{ fontSize: 14, fontWeight: 600 }} className="text-[var(--text-primary)] flex-1 truncate">
            {agent.name}
          </span>
          {agent.inbox_pending > 0 && (
            <Badge variant="danger" size="xs" label={agent.inbox_pending.toString()} />
          )}
        </div>

        {/* Row 2: role */}
        <div style={{ fontSize: 12 }} className="text-[var(--text-secondary)] mt-0.5 ml-[22px]">
          {agent.role}
        </div>

        {/* Row 3: model */}
        {!isTommy && agent.model && (
          <div style={{ fontSize: 11, fontFamily: "'SF Mono', 'Fira Code', monospace" }} className="text-[var(--text-muted)] mt-3 ml-[22px]">
            {agent.model}
          </div>
        )}

        {/* Row 4: last run + status badge */}
        {!isTommy && (
          <div className="flex items-center justify-between mt-1 ml-[22px]">
            <span style={{ fontSize: 11 }} className="text-[var(--text-muted)]">
              Last run: {relativeTime(agent.last_run)}
            </span>
            <Badge variant={statusVariant[agent.status]} size="xs" label={agent.status} />
          </div>
        )}

        {/* Row 5: skill pills */}
        <div className="flex flex-wrap gap-1.5 mt-3 ml-[22px]">
          {agent.skills.map((skill) => (
            <span
              key={skill}
              style={{
                fontSize: 10,
                background: 'var(--bg-elevated)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-xs)',
                padding: '2px 8px',
              }}
            >
              {skill}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
