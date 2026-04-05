'use client';

import { useState, ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-11 text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md whitespace-nowrap z-50"
          style={{ boxShadow: 'var(--shadow-md)', animation: 'fade-in 200ms ease-out' }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
