'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import FocusTrap from 'focus-trap-react';

export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async (title: string) => {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['tasks-all'] });
      qc.invalidateQueries({ queryKey: ['activity-home'] });
    },
  });

  // Global keyboard shortcut: `c` (or `C`) when not typing in another input.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (open) {
        if (e.key === 'Escape') { setOpen(false); setValue(''); }
        return;
      }
      if (e.key !== 'c' && e.key !== 'C') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const submit = () => {
    const title = value.trim();
    if (!title) return;
    create.mutate(title);
    setValue('');
    setOpen(false);
  };

  return (
    <>
      {/* Floating action button (primarily mobile, shows everywhere) */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Quick capture (c)"
        title="Quick capture — press c"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(99,102,241,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 30,
        }}
      >
        <Plus size={22} strokeWidth={2} />
      </button>

      {open && (
        <>
          <div
            onClick={() => { setOpen(false); setValue(''); }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(2px)',
              zIndex: 60,
            }}
          />
          <FocusTrap focusTrapOptions={{ escapeDeactivates: false, allowOutsideClick: true }}>
            <div
              style={{
                position: 'fixed',
                top: '30%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '92vw',
                maxWidth: 560,
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(16px) saturate(180%)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
                padding: 14,
                zIndex: 70,
              }}
            >
              <input
                ref={inputRef}
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                  if (e.key === 'Escape') { setOpen(false); setValue(''); }
                }}
                placeholder="New task…"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 17,
                  padding: '6px 8px',
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  gap: 16,
                }}
              >
                <span><kbd style={kbdStyle}>Enter</kbd> create</span>
                <span><kbd style={kbdStyle}>Esc</kbd> cancel</span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                  defaults: status=todo, priority=medium, no project
                </span>
              </div>
            </div>
          </FocusTrap>
        </>
      )}
    </>
  );
}

const kbdStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  padding: '1px 5px',
  fontSize: 10,
  fontFamily: "'SF Mono', 'Fira Code', monospace",
  color: 'var(--text-secondary)',
};
