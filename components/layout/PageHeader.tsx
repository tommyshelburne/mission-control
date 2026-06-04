import { ReactNode } from 'react';
import { DrawerToggle } from './DrawerToggle';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="h-[52px] flex items-center justify-between bg-[var(--bg-surface)] border-b border-[var(--border)] flex-shrink-0 px-4 md:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <DrawerToggle />
        <h1 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }} className="text-[var(--text-primary)] truncate">{title}</h1>
        {subtitle && <span className="text-12 text-[var(--text-muted)] truncate">{subtitle}</span>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
