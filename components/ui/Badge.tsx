'use client';

interface BadgeProps {
  label: string;
  variant: 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'neutral';
  size?: 'xs' | 'sm';
}

const variantStyles: Record<BadgeProps['variant'], React.CSSProperties> = {
  accent:  { background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.2)' },
  success: { background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.2)' },
  warning: { background: 'var(--warning-dim)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.2)' },
  danger:  { background: 'var(--danger-dim)', color: 'var(--danger)', border: '1px solid rgba(240,68,68,0.2)' },
  muted:   { background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
  neutral: { background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
};

export function Badge({ label, variant, size = 'sm' }: BadgeProps) {
  const isXs = size === 'xs';
  return (
    <span
      className="inline-flex items-center whitespace-nowrap"
      style={{
        ...variantStyles[variant],
        fontSize: isXs ? 10 : 11,
        fontWeight: 500,
        letterSpacing: isXs ? '0.02em' : undefined,
        textTransform: isXs ? 'uppercase' : undefined,
        lineHeight: isXs ? '14px' : '16px',
        padding: isXs ? '2px 5px' : '2px 7px',
        borderRadius: 'var(--radius-xs)',
      }}
    >
      {label}
    </span>
  );
}
