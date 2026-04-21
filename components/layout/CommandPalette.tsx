'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FileText, FolderOpen, Briefcase, LayoutGrid } from 'lucide-react';
import FocusTrap from 'focus-trap-react';

type EntityType = 'task' | 'project' | 'doc' | 'opportunity';

interface SearchHit {
  entity_type: EntityType;
  entity_id: number;
  title: string;
  snippet: string;
  rank: number;
  href: string;
}

const TYPE_ICON: Record<EntityType, typeof Search> = {
  task:        LayoutGrid,
  project:     FolderOpen,
  doc:         FileText,
  opportunity: Briefcase,
};

const TYPE_LABEL: Record<EntityType, string> = {
  task:        'Task',
  project:     'Project',
  doc:         'Doc',
  opportunity: 'Opportunity',
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Cmd+K / Ctrl+K toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (open && e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Reset when opening
  useEffect(() => {
    if (open) {
      setQ('');
      setResults([]);
      setSelected(0);
    }
  }, [open]);

  // Debounced fetch
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (!query) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=20`, { signal: ctrl.signal });
        const data = await res.json();
        setResults(data.results ?? []);
        setSelected(0);
      } catch {
        /* aborted */
      }
    }, 120);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [q, open]);

  const go = (hit: SearchHit) => {
    setOpen(false);
    router.push(hit.href);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results[selected];
      if (hit) go(hit);
    }
  };

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(2px)',
          zIndex: 80,
        }}
      />
      <FocusTrap focusTrapOptions={{ escapeDeactivates: false, allowOutsideClick: true }}>
        <div
          style={{
            position: 'fixed',
            top: '15%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '92vw',
            maxWidth: 640,
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
            zIndex: 90,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            maxHeight: '70vh',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <Search size={16} className="text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder="Search tasks, projects, docs, opportunities…"
              style={{
                flex: 1,
                marginLeft: 12,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 15,
              }}
            />
            <kbd style={kbdStyle}>Esc</kbd>
          </div>

          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
            {q.trim() === '' ? (
              <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                Type to search across tasks, projects, docs, opportunities.<br />
                <span style={{ marginTop: 8, display: 'inline-block' }}>
                  <kbd style={kbdStyle}>↑</kbd> <kbd style={kbdStyle}>↓</kbd> navigate&nbsp;&nbsp;
                  <kbd style={kbdStyle}>⏎</kbd> open
                </span>
              </div>
            ) : results.length === 0 ? (
              <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                No matches.
              </div>
            ) : (
              results.map((hit, i) => {
                const Icon = TYPE_ICON[hit.entity_type] ?? Search;
                const isSelected = i === selected;
                return (
                  <div
                    key={`${hit.entity_type}-${hit.entity_id}`}
                    data-row={i}
                    onMouseEnter={() => setSelected(i)}
                    onClick={() => go(hit)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(99,102,241,0.14)' : 'transparent',
                    }}
                  >
                    <Icon size={14} className="text-[var(--text-muted)]" style={{ marginTop: 3, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }} className="truncate">
                          {hit.title}
                        </span>
                        <span style={{
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border)',
                          borderRadius: 3,
                          padding: '1px 5px',
                        }}>
                          {TYPE_LABEL[hit.entity_type]}
                        </span>
                      </div>
                      {hit.snippet && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--text-secondary)',
                            marginTop: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          // eslint-disable-next-line react/no-danger
                          dangerouslySetInnerHTML={{ __html: hit.snippet }}
                        />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </FocusTrap>
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
