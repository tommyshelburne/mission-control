'use client';

import { ReactNode } from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="text-[var(--text-muted)]">{icon}</div>
      <p className="text-14 font-medium text-[var(--text-primary)]">{title}</p>
      {subtitle && <p className="text-13 text-[var(--text-secondary)]">{subtitle}</p>}
      {action && (
        <Button variant="ghost" size="sm" onClick={action.onClick} className="mt-2">
          {action.label}
        </Button>
      )}
    </div>
  );
}
