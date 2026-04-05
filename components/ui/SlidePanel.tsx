'use client';

import { useEffect, useState, ReactNode } from 'react';
import { X } from 'lucide-react';
import FocusTrap from 'focus-trap-react';

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

const DURATION = 280;

export function SlidePanel({ open, onClose, title, children }: SlidePanelProps) {
  const [mounted, setMounted] = useState(open);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setAnimating(false);
    } else if (mounted) {
      setAnimating(true);
      const t = setTimeout(() => {
        setMounted(false);
        setAnimating(false);
      }, DURATION);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(2px)',
          opacity: animating ? 0 : 1,
          transition: `opacity ${DURATION}ms ease`,
        }}
      />
      {/* Panel */}
      <FocusTrap active={!animating} focusTrapOptions={{ escapeDeactivates: false, allowOutsideClick: true }}>
        <div
          style={{
            position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 50,
            width: 420,
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(16px) saturate(180%)',
            borderLeft: '1px solid var(--glass-border)',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column',
            transform: animating ? 'translateX(100%)' : 'translateX(0)',
            opacity: animating ? 0 : 1,
            transition: `transform ${DURATION}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${DURATION}ms ease`,
            animation: !animating && mounted ? 'slide-in-right 260ms cubic-bezier(0.16, 1, 0.3, 1) forwards' : 'none',
          }}
        >
          {/* Header */}
          <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {title && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', marginLeft: 'auto' }}
              aria-label="Close panel"
            >
              <X size={16} />
            </button>
          </div>
          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {children}
          </div>
        </div>
      </FocusTrap>
    </>
  );
}
