'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/** Returns a timestamp (ms) that refreshes on a given interval. Keeps components pure. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Which React Query caches each server event invalidates. An 'activity' event
// fires on any activity_log write (incl. agent- or TickTick-sourced task/opp
// changes), so it also refreshes the underlying entity lists.
const INVALIDATE_ON_EVENT: Record<string, string[]> = {
  activity: ['activity-home', 'activity-recent', 'tasks', 'tasks-all', 'opportunities'],
  notification: ['notifications', 'notifications-actions'],
  agent_status: ['agents'],
};

/**
 * Subscribes to the server's SSE stream (/api/events) and invalidates the
 * affected React Query caches as events arrive — making the dashboard genuinely
 * live. The stream was fully built server-side but never consumed; the UI only
 * polled under a "Live" label (triage F4). Mount once near the root.
 * EventSource reconnects automatically on a dropped connection.
 */
export function useEventStream(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      let type: string | undefined;
      try {
        type = (JSON.parse(e.data) as { type?: string }).type;
      } catch {
        return;
      }
      for (const key of (type && INVALIDATE_ON_EVENT[type]) || []) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    };
    return () => es.close();
  }, [queryClient]);
}
