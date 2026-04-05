'use client';

interface StatusDotProps {
  status: 'active' | 'idle' | 'error' | 'unknown';
  size?: number;
}

const statusColors: Record<StatusDotProps['status'], string> = {
  active:  'var(--success)',
  idle:    'var(--text-muted)',
  error:   'var(--danger)',
  unknown: 'var(--border-mid)',
};

export function StatusDot({ status, size = 8 }: StatusDotProps) {
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: statusColors[status],
        animation: status === 'active' ? 'pulse-dot 2s ease-in-out infinite' : undefined,
      }}
    />
  );
}
