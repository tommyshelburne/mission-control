import type { NextRequest } from 'next/server';
import { createSubscriberClient, EVENTS_CHANNEL } from '@/lib/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_INTERVAL_MS = 25_000;

export async function GET(request: NextRequest) {
  const sub = createSubscriberClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // Initial comment flushes headers and confirms the connection to the client
      safeEnqueue(`: connected ${Date.now()}\n\n`);

      const heartbeat = setInterval(() => {
        safeEnqueue(`: ping\n\n`);
      }, HEARTBEAT_INTERVAL_MS);

      sub.on('message', (channel, message) => {
        if (channel === EVENTS_CHANNEL) {
          // Multi-line payloads must prefix every line with `data:` per the SSE
          // spec. JSON.stringify produces a single line, but be defensive in
          // case payload schema ever includes raw newlines.
          const lines = message.split('\n').map((l) => `data: ${l}`).join('\n');
          safeEnqueue(`${lines}\n\n`);
        }
      });

      try {
        await sub.subscribe(EVENTS_CHANNEL);
      } catch (err) {
        console.error('[events] subscribe failed:', err);
        safeEnqueue(`event: error\ndata: subscribe_failed\n\n`);
      }

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        sub.disconnect();
        try { controller.close(); } catch { /* already closed */ }
      };

      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
