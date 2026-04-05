'use client';

import { ReactNode, ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

const variantStyles: Record<ButtonProps['variant'], string> = {
  primary: 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white',
  ghost:   'bg-transparent border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border-mid)]',
  danger:  'bg-[var(--danger-dim)] text-[var(--danger)] border border-[rgba(240,68,68,0.2)] hover:bg-[rgba(240,68,68,0.2)]',
};

export function Button({ variant, size = 'md', loading, icon, children, className = '', disabled, ...props }: ButtonProps) {
  const sizeClass = size === 'sm'
    ? 'h-[26px] px-2.5 text-11 gap-1.5'
    : 'h-8 px-3 text-13 gap-2';

  return (
    <button
      className={`inline-flex items-center justify-center font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeClass} ${className}`}
      style={{ transition: 'all 100ms', borderRadius: 'var(--radius-sm)', boxShadow: 'none' }}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" style={{ animation: 'spin 0.6s linear infinite' }} />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
