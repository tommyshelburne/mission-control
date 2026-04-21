'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, X, Check } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SlidePanel, Badge } from '@/components/ui';

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

interface NotifResponse {
  notifications: Notification[];
  total: number;
  unread: number;
}

const TYPE_VARIANT: Record<Notification['type'], 'accent' | 'warning' | 'danger' | 'muted'> = {
  info:            'accent',
  warning:         'warning',
  action_required: 'danger',
  agent_update:    'muted',
};

function relativeTime(iso: string): string {
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

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data } = useQuery<NotifResponse>({
    queryKey: ['notifications'],
    queryFn: async () => (await fetch('/api/notifications?limit=50')).json(),
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const dismiss = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = data?.unread ?? 0;
  const notifications = data?.notifications ?? [];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        className="relative flex items-center justify-center rounded-md hover:bg-[var(--bg-elevated)] transition-colors"
        style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
      >
        <Bell size={15} className="text-[var(--text-muted)]" strokeWidth={1.8} />
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 14,
              height: 14,
              padding: '0 3px',
              borderRadius: 7,
              background: 'var(--danger)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <SlidePanel open={open} onClose={() => setOpen(false)} title={`Notifications (${unread} unread)`}>
        {notifications.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '48px 0' }}>
            Nothing to see here.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                style={{
                  background: n.read ? 'transparent' : 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12,
                  opacity: n.read ? 0.6 : 1,
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={TYPE_VARIANT[n.type]} size="xs" label={n.type.replace('_', ' ')} />
                      {n.source_agent && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {n.source_agent}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {relativeTime(n.created_at)}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: n.body ? 4 : 0 }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {n.body}
                      </div>
                    )}
                    {n.action_url && (
                      <Link
                        href={n.action_url}
                        onClick={() => {
                          if (!n.read) markRead.mutate(n.id);
                          setOpen(false);
                        }}
                        style={{
                          display: 'inline-block',
                          marginTop: 6,
                          fontSize: 12,
                          color: 'var(--accent)',
                          textDecoration: 'none',
                        }}
                      >
                        Open →
                      </Link>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--border)]">
                  {!n.read && (
                    <button
                      onClick={() => markRead.mutate(n.id)}
                      className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      style={{ fontSize: 11, background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}
                    >
                      <Check size={11} /> Mark read
                    </button>
                  )}
                  <button
                    onClick={() => dismiss.mutate(n.id)}
                    className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--danger)]"
                    style={{ fontSize: 11, background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, marginLeft: 'auto' }}
                  >
                    <X size={11} /> Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SlidePanel>
    </>
  );
}
