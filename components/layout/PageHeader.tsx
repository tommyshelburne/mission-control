import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="h-[52px] flex items-center justify-between bg-[var(--bg-surface)] border-b border-[var(--border)] flex-shrink-0" style={{ padding: '0 24px' }}>
      <div className="flex items-center gap-3">
        <h1 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }} className="text-[var(--text-primary)]">{title}</h1>
        {subtitle && <span className="text-12 text-[var(--text-muted)]">{subtitle}</span>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
