'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Pin, Search, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Spinner } from '@/components/ui';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MemoryEntry {
  date: string;
  size: number;
  words: number;
  preview?: string;
}

interface MemoryContent {
  content: string;
  meta: { size: number; words: number; date?: string };
}

type Selection = { type: 'date'; date: string } | { type: 'longterm' };

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return kb < 10 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function groupMemories(memories: MemoryEntry[]): { label: string; items: MemoryEntry[] }[] {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const groups: Map<string, MemoryEntry[]> = new Map();
  const order: string[] = [];

  function addToGroup(label: string, entry: MemoryEntry) {
    if (!groups.has(label)) {
      groups.set(label, []);
      order.push(label);
    }
    groups.get(label)!.push(entry);
  }

  for (const entry of memories) {
    const entryDate = new Date(entry.date + 'T12:00:00');

    if (entry.date === todayStr) {
      addToGroup('TODAY', entry);
    } else if (entry.date === yesterdayStr) {
      addToGroup('YESTERDAY', entry);
    } else if (entryDate > sevenDaysAgo) {
      addToGroup('THIS WEEK', entry);
    } else {
      const monthLabel = entryDate
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        .toUpperCase();
      addToGroup(monthLabel, entry);
    }
  }

  return order.map((label) => ({ label, items: groups.get(label)! }));
}

export default function MemoriesPage() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [content, setContent] = useState<MemoryContent | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);

  const fetchContent = useCallback(async (sel: Selection) => {
    setContentLoading(true);
    setContent(null);
    try {
      const url =
        sel.type === 'longterm' ? '/api/memories/longterm' : `/api/memories/${sel.date}`;
      const res = await fetch(url);
      if (res.ok) {
        setContent(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setContentLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadList() {
      try {
        const res = await fetch('/api/memories');
        if (res.ok) {
          const data = await res.json();
          setMemories(data.memories);
          if (data.memories.length > 0) {
            const first: Selection = { type: 'date', date: data.memories[0].date };
            setSelection(first);
            fetchContent(first);
          }
        }
      } catch {
        // silently fail
      } finally {
        setListLoading(false);
      }
    }
    loadList();
  }, [fetchContent]);

  // Filtered list (for both rendering and keyboard nav)
  const filtered = useMemo(() => {
    if (!search.trim()) return memories;
    const q = search.toLowerCase();
    return memories.filter(
      (m) =>
        m.date.includes(q) ||
        formatDateShort(m.date).toLowerCase().includes(q) ||
        (m.preview ?? '').toLowerCase().includes(q)
    );
  }, [memories, search]);

  // Keyboard nav: ↑/↓ to step through filtered list, '/' to focus search, Esc to clear
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // '/' opens search (Vim style) — but not while typing
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      // Esc clears + blurs search when search is focused
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setSearch('');
        searchRef.current?.blur();
        return;
      }

      // Arrow keys step through filtered list (works whether search is focused or not)
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && filtered.length > 0) {
        // Don't fight native input cursor movement when search has selected text
        if (isTyping && target !== searchRef.current) return;
        e.preventDefault();
        const currentIndex =
          selection?.type === 'date'
            ? filtered.findIndex((m) => m.date === selection.date)
            : -1;
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const next = Math.max(0, Math.min(filtered.length - 1, currentIndex + delta));
        const sel: Selection = { type: 'date', date: filtered[next].date };
        setSelection(sel);
        fetchContent(sel);
        // Scroll item into view
        requestAnimationFrame(() => {
          listScrollRef.current
            ?.querySelector(`[data-date="${filtered[next].date}"]`)
            ?.scrollIntoView({ block: 'nearest' });
        });
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [filtered, selection, fetchContent]);

  function handleSelect(sel: Selection) {
    setSelection(sel);
    fetchContent(sel);
  }

  const isSelected = (sel: Selection) => {
    if (!selection) return false;
    if (sel.type === 'longterm' && selection.type === 'longterm') return true;
    if (sel.type === 'date' && selection.type === 'date') return sel.date === selection.date;
    return false;
  };

  const groups = groupMemories(filtered);

  const subtitle = memories.length > 0 ? `${memories.length} entries` : '';

  return (
    <>
      <PageHeader title="Memories" subtitle={subtitle} />

      <div className="flex h-full overflow-hidden">
        {/* Left panel */}
        <div className="w-[260px] flex-shrink-0 border-r border-[var(--border)] flex flex-col overflow-hidden bg-[var(--bg-surface)]">
          {/* Pinned: Long-Term Memory */}
          <button
            onClick={() => handleSelect({ type: 'longterm' })}
            className="h-10 flex items-center gap-2 px-4 cursor-pointer border-b border-[var(--border)] flex-shrink-0"
            style={{
              background: isSelected({ type: 'longterm' })
                ? 'var(--bg-elevated)'
                : 'transparent',
              borderLeft: isSelected({ type: 'longterm' })
                ? '2px solid var(--accent)'
                : '2px solid transparent',
              transition: 'background 80ms ease',
            }}
          >
            <Pin size={14} className="text-[var(--text-muted)] flex-shrink-0" />
            <span className="text-12 font-medium text-[var(--text-primary)]">
              Long-Term Memory
            </span>
          </button>

          {/* Search */}
          <div className="px-3 py-2 border-b border-[var(--border)] flex-shrink-0">
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
              />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search dates and previews… (/)"
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md text-12 text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] outline-none focus:border-[var(--accent)]"
                style={{ height: 26, padding: '0 8px 0 24px' }}
              />
              {search && (
                <button
                  onClick={() => {
                    setSearch('');
                    searchRef.current?.focus();
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Date list */}
          <div className="flex-1 overflow-y-auto" ref={listScrollRef}>
            {listLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size={16} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6 text-12 text-[var(--text-muted)] text-center">
                No matches for &ldquo;{search}&rdquo;
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <div className="uppercase font-medium" style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-muted)', padding: '0 16px', marginTop: 16, marginBottom: 4 }}>
                    {group.label}
                  </div>
                  {group.items.map((entry) => {
                    const sel: Selection = { type: 'date', date: entry.date };
                    const selected = isSelected(sel);
                    return (
                      <button
                        key={entry.date}
                        onClick={() => handleSelect(sel)}
                        className="w-full text-left flex flex-col cursor-pointer hover:bg-[var(--bg-hover)]"
                        data-date={entry.date}
                        style={{
                          padding: '6px 12px',
                          background: selected ? 'var(--bg-elevated)' : 'transparent',
                          borderLeft: selected
                            ? '2px solid var(--accent)'
                            : '2px solid transparent',
                          transition: 'background 80ms ease',
                        }}
                      >
                        <div className="flex items-baseline justify-between w-full">
                          <span className="text-12 text-[var(--text-primary)] font-medium">
                            {formatDateShort(entry.date)}
                          </span>
                          <span className="text-10 text-[var(--text-muted)]">
                            {entry.words.toLocaleString()}w
                          </span>
                        </div>
                        {entry.preview && (
                          <span
                            className="text-11 text-[var(--text-muted)] mt-0.5 overflow-hidden"
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              lineHeight: 1.4,
                            }}
                          >
                            {entry.preview}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Keyboard hint */}
          {!listLoading && memories.length > 0 && (
            <div className="border-t border-[var(--border)] flex-shrink-0 text-10 text-[var(--text-muted)] flex items-center justify-between" style={{ padding: '6px 12px' }}>
              <span>↑↓ navigate</span>
              <span>/ to search</span>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-base)]">
          {contentLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Spinner size={20} />
            </div>
          ) : content ? (
            <div className="flex-1 overflow-y-auto" style={{ padding: '32px 40px' }}>
              <div className="max-w-[680px] mx-auto">
                {/* Header */}
                <h2 className="text-18 font-semibold text-[var(--text-primary)]">
                  {selection?.type === 'longterm'
                    ? 'Long-Term Memory'
                    : formatDateFull(content.meta.date!)}
                </h2>
                <p className="text-12 text-[var(--text-muted)] mt-1">
                  {content.meta.words.toLocaleString()} words &middot;{' '}
                  {formatFileSize(content.meta.size)}
                </p>
                <div className="border-b border-[var(--border)] mt-4 mb-6" />

                {/* Content */}
                <div className="mc-prose">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[var(--text-muted)]">Select a memory to read</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
