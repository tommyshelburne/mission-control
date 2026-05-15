'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNow } from '@/lib/hooks';
import { FileText, Eye, EyeOff, Download, MoreHorizontal, Plus, ChevronDown, ChevronRight, Check, Circle, Clock, FolderTree, Calendar, Archive, X, CheckSquare, Square } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { CodeMirrorEditor } from '@/components/docs/CodeMirrorEditor';
import { toast } from '@/lib/toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type ViewMode = 'category' | 'date';
type AgeFilter = 'all' | '7d' | '30d' | '90d';

const AGE_FILTER_MS: Record<AgeFilter, number | null> = {
  all: null,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_SHELF_MAX = 8;

function dateBucket(ms: number): string {
  const now = new Date();
  const then = new Date(ms);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((startOfToday - new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) / dayMs);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  if (diffDays < 14) return 'Last week';
  if (diffDays < 30) return 'This month';
  if (diffDays < 90) return 'Last 90 days';
  return 'Older';
}

const DATE_BUCKET_ORDER = ['Today', 'Yesterday', 'This week', 'Last week', 'This month', 'Last 90 days', 'Older'];

interface DocEntry {
  path: string;
  title: string;
  category: string;
  size: number;
  words: number;
  modified: number;
  archived: boolean;
}

interface DocContent {
  content: string;
  meta: { path: string; size: number; words: number; modified: number };
}

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved';

function groupByCategory(docs: DocEntry[]): Map<string, DocEntry[]> {
  const map = new Map<string, DocEntry[]>();
  for (const doc of docs) {
    const group = map.get(doc.category) || [];
    group.push(doc);
    map.set(doc.category, group);
  }
  return map;
}

function groupByDateBucket(docs: DocEntry[]): Map<string, DocEntry[]> {
  const map = new Map<string, DocEntry[]>();
  for (const doc of docs) {
    const bucket = dateBucket(doc.modified);
    const group = map.get(bucket) || [];
    group.push(doc);
    map.set(bucket, group);
  }
  return map;
}

export default function DocsPage() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<DocContent | null>(null);
  const [editContent, setEditContent] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [preview, setPreview] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [newFileInput, setNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { const v = localStorage.getItem('mc.docs.viewMode'); return (v === 'category' || v === 'date') ? v : 'category'; } catch { return 'category'; }
  });
  const [ageFilter, setAgeFilter] = useState<AgeFilter>(() => {
    try { const a = localStorage.getItem('mc.docs.ageFilter'); return (a === 'all' || a === '7d' || a === '30d' || a === '90d') ? a : 'all'; } catch { return 'all'; }
  });
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const persistViewMode = useCallback((next: ViewMode) => {
    setViewMode(next);
    try { localStorage.setItem('mc.docs.viewMode', next); } catch { /* ignore */ }
  }, []);
  const persistAgeFilter = useCallback((next: AgeFilter) => {
    setAgeFilter(next);
    try { localStorage.setItem('mc.docs.ageFilter', next); } catch { /* ignore */ }
  }, []);

  // Load docs list
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/docs');
        if (res.ok) {
          const data = await res.json();
          setDocs(data.docs);
        }
      } catch {
        // silently fail
      } finally {
        setListLoading(false);
      }
    }
    load();
  }, []);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const loadFile = useCallback(async (filePath: string) => {
    setContentLoading(true);
    setContent(null);
    setSaveStatus('idle');
    // Restore per-file preview preference; default is rich preview (true).
    try {
      const stored = localStorage.getItem(`mc.docs.preview.${filePath}`);
      setPreview(stored == null ? true : stored === '1');
    } catch {
      setPreview(true);
    }
    try {
      const res = await fetch(`/api/docs/file?path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const data: DocContent = await res.json();
        setContent(data);
        setEditContent(data.content);
        setSelected(filePath);
      }
    } catch {
      // silently fail
    } finally {
      setContentLoading(false);
    }
  }, []);

  const togglePreview = useCallback(() => {
    setPreview((prev) => {
      const next = !prev;
      if (selected) {
        try {
          localStorage.setItem(`mc.docs.preview.${selected}`, next ? '1' : '0');
        } catch {
          // localStorage disabled — degrade to in-session-only
        }
      }
      return next;
    });
  }, [selected]);

  const saveFile = useCallback(async (filePath: string, newContent: string) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/docs/file?path=${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });
      if (res.ok) {
        setSaveStatus('saved');
        // Update content meta
        setContent((prev) => prev ? { ...prev, content: newContent } : prev);
      }
    } catch {
      setSaveStatus('unsaved');
    }
  }, []);

  const handleEditorChange = useCallback((value: string) => {
    setEditContent(value);
    setSaveStatus('unsaved');

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (selected) saveFile(selected, value);
    }, 1000);
  }, [selected, saveFile]);

  // Cmd/Ctrl+S to save immediately (cancels the autosave timer)
  useEffect(() => {
    function handleSaveShortcut(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (selected && saveStatus !== 'saving') {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveFile(selected, editContent);
        }
      }
    }
    window.addEventListener('keydown', handleSaveShortcut);
    return () => window.removeEventListener('keydown', handleSaveShortcut);
  }, [selected, editContent, saveStatus, saveFile]);

  const handleDelete = useCallback(async (filePath: string) => {
    if (!confirm('Move this file to trash?')) return;
    try {
      const res = await fetch(`/api/docs/file?path=${encodeURIComponent(filePath)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => d.path !== filePath));
        if (selected === filePath) {
          setSelected(null);
          setContent(null);
        }
      } else {
        toast.error(`Couldn't delete: ${res.status}`);
      }
    } catch (err) {
      toast.error(`Couldn't delete: ${(err as Error).message}`);
    }
    setMenuOpen(null);
  }, [selected]);

  const handleDownload = useCallback((filePath: string) => {
    const url = `/api/docs/export?path=${encodeURIComponent(filePath)}&format=md`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
    setMenuOpen(null);
  }, []);

  const toggleSelected = useCallback((filePath: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedPaths(new Set()), []);

  const handleBulkArchive = useCallback(async () => {
    if (selectedPaths.size === 0 || archiving) return;
    const paths = Array.from(selectedPaths);
    if (!confirm(`Archive ${paths.length} file${paths.length === 1 ? '' : 's'}? They'll move to .archive/ and disappear from the sidebar.`)) return;
    setArchiving(true);
    try {
      const res = await fetch('/api/docs/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });
      if (res.ok) {
        const data = await res.json();
        const archivedSet = new Set<string>(data.archived);
        setDocs((prev) => prev.filter((d) => !archivedSet.has(d.path)));
        if (selected && archivedSet.has(selected)) {
          setSelected(null);
          setContent(null);
        }
        setSelectedPaths(new Set());
        if (data.failed?.length) {
          toast.error(`Archived ${data.archived.length} of ${paths.length} — ${data.failed.length} failed`);
          console.error('Bulk archive failures:', data.failed);
        } else {
          toast.success(`Archived ${data.archived.length} file${data.archived.length === 1 ? '' : 's'}`);
        }
      } else {
        toast.error(`Couldn't archive: ${res.status}`);
      }
    } catch (err) {
      toast.error(`Couldn't archive: ${(err as Error).message}`);
    } finally {
      setArchiving(false);
    }
  }, [selectedPaths, archiving, selected]);

  const handleNewFile = useCallback(async () => {
    const name = newFileName.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/docs/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category: 'notes',
          content: `# ${name.replace(/\.md$/, '')}\n\n`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newDoc: DocEntry = {
          path: data.path,
          title: name.replace(/\.md$/, ''),
          category: 'notes',
          size: 0,
          words: 0,
          modified: Date.now(),
          archived: false,
        };
        setDocs((prev) => [newDoc, ...prev]);
        setNewFileInput(false);
        setNewFileName('');
        loadFile(data.path);
      } else {
        toast.error(`Couldn't create file: ${res.status}`);
      }
    } catch (err) {
      toast.error(`Couldn't create file: ${(err as Error).message}`);
    }
  }, [newFileName, loadFile]);

  const toggleGroup = (cat: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const now = useNow();

  const filtered = useMemo(() => {
    const ageWindow = AGE_FILTER_MS[ageFilter];
    const cutoff = ageWindow === null ? 0 : now - ageWindow;
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (ageWindow !== null && d.modified < cutoff) return false;
      if (!q) return true;
      return d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q);
    });
  }, [docs, search, ageFilter, now]);

  const activeDocs = useMemo(() => filtered.filter((d) => !d.archived), [filtered]);
  const archivedDocs = useMemo(() => filtered.filter((d) => d.archived), [filtered]);
  const activeGroups = useMemo(() => groupByCategory(activeDocs), [activeDocs]);
  const archivedGroups = useMemo(() => groupByCategory(archivedDocs), [archivedDocs]);
  // Show only the last few path segments so the breadcrumb stays readable
  // regardless of the absolute root configured via OPENCLAW_ROOT.
  const breadcrumb = selected ? selected.split('/').filter(Boolean).slice(-3).join('/') : '';

  // Most-recent modified time per category — surfaced in collapsed group headers
  // so a quick glance shows whether a category has fresh activity.
  const mostRecentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of filtered) {
      const cur = map.get(d.category) ?? 0;
      if (d.modified > cur) map.set(d.category, d.modified);
    }
    return map;
  }, [filtered]);

  // Recent shelf — last 7 days across all categories, capped, only in category view
  const recentShelf = useMemo(() => {
    if (viewMode !== 'category') return [];
    const cutoff = now - RECENT_WINDOW_MS;
    return activeDocs
      .filter((d) => d.modified >= cutoff)
      .sort((a, b) => b.modified - a.modified)
      .slice(0, RECENT_SHELF_MAX);
  }, [activeDocs, viewMode, now]);

  // Date-bucket groupings for date view (active only — archived stays in the
  // collapsed Archived section regardless of view mode for clarity)
  const dateGroups = useMemo(() => groupByDateBucket(activeDocs), [activeDocs]);

  const selectionMode = selectedPaths.size > 0;

  const renderRow = (doc: DocEntry, opts?: { showCategory?: boolean }) => {
    const isSelected = selectedPaths.has(doc.path);
    const showCategory = opts?.showCategory ?? false;
    return (
      <div
        key={doc.path}
        className="group relative h-9 flex items-center justify-between px-3 cursor-pointer hover:bg-[var(--bg-hover)]"
        style={{
          background: selected === doc.path ? 'var(--bg-elevated)' : isSelected ? 'var(--bg-hover)' : undefined,
          borderLeft: selected === doc.path
            ? '2px solid var(--accent)'
            : '2px solid transparent',
          transition: 'background 80ms ease',
        }}
        onClick={() => loadFile(doc.path)}
      >
        <button
          onClick={(e) => toggleSelected(doc.path, e)}
          className={`w-4 h-4 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] flex-shrink-0 mr-1 ${
            selectionMode || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          title={isSelected ? 'Deselect' : 'Select'}
        >
          {isSelected ? <CheckSquare size={12} className="text-[var(--accent)]" /> : <Square size={12} />}
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText size={12} className="text-[var(--text-muted)] flex-shrink-0" />
          <span className="text-12 text-[var(--text-primary)] truncate">
            {doc.title}
          </span>
          {showCategory && (
            <span className="text-10 text-[var(--text-muted)] flex-shrink-0">
              · {doc.category}
            </span>
          )}
        </div>
        <span
          className="text-10 text-[var(--text-muted)] flex-shrink-0 group-hover:hidden tabular-nums"
          title={`${doc.words.toLocaleString()} words · modified ${new Date(doc.modified).toLocaleString()}`}
        >
          {relativeTime(doc.modified)}
        </span>
        <div className="relative hidden group-hover:block flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(menuOpen === doc.path ? null : doc.path);
            }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]"
          >
            <MoreHorizontal size={12} />
          </button>
          {menuOpen === doc.path && (
            <div
              ref={menuRef}
              className="absolute right-0 top-6 z-50 w-32 py-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md shadow-[var(--shadow-md)]"
            >
              <button
                onClick={(e) => { e.stopPropagation(); handleDownload(doc.path); }}
                className="w-full text-left px-3 py-1.5 text-12 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                Download
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(doc.path); }}
                className="w-full text-left px-3 py-1.5 text-12 text-[var(--danger)] hover:bg-[var(--danger-dim)]"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCategory = (category: string, items: DocEntry[]) => {
    const recent = mostRecentByCategory.get(category);
    return (
      <div key={category}>
        <button
          onClick={() => toggleGroup(category)}
          className="w-full flex items-center gap-1 text-10 uppercase tracking-wider text-[var(--text-muted)] font-medium px-3 py-2 mt-2 sticky top-0 bg-[var(--bg-surface)] cursor-pointer hover:text-[var(--text-secondary)]"
        >
          {collapsedGroups.has(category) ? (
            <ChevronRight size={10} />
          ) : (
            <ChevronDown size={10} />
          )}
          {category}
          <span className="ml-auto flex items-center gap-2 text-[var(--text-muted)]">
            {recent !== undefined && (
              <span className="tabular-nums normal-case tracking-normal" title={`Most recent: ${new Date(recent).toLocaleString()}`}>
                {relativeTime(recent)}
              </span>
            )}
            <span>{items.length}</span>
          </span>
        </button>
        {!collapsedGroups.has(category) && items.map((doc) => renderRow(doc))}
      </div>
    );
  };

  const renderDateBucket = (bucket: string, items: DocEntry[]) => (
    <div key={bucket}>
      <div className="w-full flex items-center gap-1 text-10 uppercase tracking-wider text-[var(--text-muted)] font-medium px-3 py-2 mt-2 sticky top-0 bg-[var(--bg-surface)]">
        {bucket}
        <span className="ml-auto text-[var(--text-muted)]">{items.length}</span>
      </div>
      {items
        .sort((a, b) => b.modified - a.modified)
        .map((doc) => renderRow(doc, { showCategory: true }))}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Docs"
        subtitle={docs.length > 0 ? `${docs.length} files` : ''}
      />

      <div className="flex h-full overflow-hidden">
        {/* Left panel */}
        <div className="w-[260px] flex-shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--bg-surface)]">
          {/* Top bar */}
          <div className="h-10 flex items-center px-3 gap-2 border-b border-[var(--border)] flex-shrink-0">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search docs..."
              className="flex-1 bg-[var(--bg-elevated)] border-none rounded-md px-2 h-7 text-12 text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] outline-none"
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus size={12} />}
              onClick={() => { setNewFileInput(true); setNewFileName(''); }}
            >
              New
            </Button>
          </div>

          {/* View / filter bar */}
          <div className="h-9 flex items-center px-3 gap-2 border-b border-[var(--border)] flex-shrink-0 bg-[var(--bg-surface)]">
            <div className="flex items-center bg-[var(--bg-elevated)] rounded-md overflow-hidden">
              <button
                onClick={() => persistViewMode('category')}
                className={`px-2.5 h-7 flex items-center gap-1.5 text-11 ${
                  viewMode === 'category'
                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
                title="Group by category"
              >
                <FolderTree size={12} />
                Category
              </button>
              <button
                onClick={() => persistViewMode('date')}
                className={`px-2.5 h-7 flex items-center gap-1.5 text-11 ${
                  viewMode === 'date'
                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
                title="Group by date"
              >
                <Calendar size={12} />
                Date
              </button>
            </div>
            <select
              value={ageFilter}
              onChange={(e) => persistAgeFilter(e.target.value as AgeFilter)}
              className="bg-[var(--bg-elevated)] border-none rounded-md px-2 h-7 text-11 text-[var(--text-secondary)] outline-none cursor-pointer"
              title="Filter by age"
            >
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>

          {/* Bulk action bar (visible when files are selected) */}
          {selectionMode && (
            <div className="h-9 flex items-center px-3 gap-2 border-b border-[var(--border)] flex-shrink-0 bg-[var(--bg-elevated)]">
              <span className="text-11 text-[var(--text-secondary)] tabular-nums">
                {selectedPaths.size} selected
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Archive size={12} />}
                  onClick={handleBulkArchive}
                  disabled={archiving}
                  title="Move selected to .archive/ (hidden from sidebar; files preserved on disk)"
                >
                  {archiving ? 'Archiving…' : 'Archive'}
                </Button>
                <button
                  onClick={clearSelection}
                  className="w-[26px] h-[26px] flex items-center justify-center rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                  title="Clear selection"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          {/* New file input */}
          {newFileInput && (
            <div className="px-3 py-2 border-b border-[var(--border)]">
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNewFile();
                  if (e.key === 'Escape') { setNewFileInput(false); setNewFileName(''); }
                }}
                placeholder="filename.md"
                autoFocus
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-2 h-7 text-12 text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}

          {/* File list */}
          <div className="flex-1 overflow-y-auto">
            {listLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size={16} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-12 text-[var(--text-muted)]">
                No files found
              </div>
            ) : (
              <>
                {viewMode === 'category' && recentShelf.length > 0 && (
                  <div>
                    <div className="w-full flex items-center gap-1 text-10 uppercase tracking-wider text-[var(--text-muted)] font-medium px-3 py-2 mt-1 sticky top-0 bg-[var(--bg-surface)]">
                      <Clock size={10} />
                      Recent
                      <span className="ml-auto">{recentShelf.length}</span>
                    </div>
                    {recentShelf.map((doc) => renderRow(doc, { showCategory: true }))}
                    <div className="border-t border-[var(--border)] mx-3 mt-2" />
                  </div>
                )}
                {viewMode === 'category' &&
                  Array.from(activeGroups.entries()).map(([category, items]) =>
                    renderCategory(category, items)
                  )}
                {viewMode === 'date' &&
                  DATE_BUCKET_ORDER
                    .filter((b) => dateGroups.has(b))
                    .map((b) => renderDateBucket(b, dateGroups.get(b)!))}
                {archivedDocs.length > 0 && (
                  <div className="mt-4 border-t border-[var(--border)] pt-1">
                    <button
                      onClick={() => setArchivedExpanded((v) => !v)}
                      className="w-full flex items-center gap-1 text-10 uppercase tracking-wider text-[var(--text-muted)] font-medium px-3 py-2 mt-1 cursor-pointer hover:text-[var(--text-secondary)]"
                    >
                      {archivedExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      Archived
                      <span className="ml-auto text-[var(--text-muted)]">{archivedDocs.length}</span>
                    </button>
                    {archivedExpanded &&
                      Array.from(archivedGroups.entries()).map(([category, items]) =>
                        renderCategory(category, items)
                      )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected && content && !contentLoading && (
            <div className="h-9 flex items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--bg-surface)] flex-shrink-0">
              <span className="text-12 text-[var(--text-muted)]">
                {breadcrumb.split('/').map((part, i, arr) => (
                  <span key={i}>
                    {part}
                    {i < arr.length - 1 && <span className="mx-1 text-[var(--text-muted)]">/</span>}
                  </span>
                ))}
              </span>
              <div className="flex items-center gap-2">
                {saveStatus === 'saved' && (
                  <span className="flex items-center gap-1 text-11 text-[var(--success)]" title="All changes saved">
                    <Check size={11} />
                    Saved
                  </span>
                )}
                {saveStatus === 'unsaved' && (
                  <span className="flex items-center gap-1 text-11 text-[var(--warning)]" title="Unsaved changes — autosave in 1s, or ⌘S to save now">
                    <Circle size={9} fill="currentColor" />
                    Unsaved
                  </span>
                )}
                {saveStatus === 'saving' && (
                  <span className="flex items-center gap-1 text-11 text-[var(--text-muted)]">
                    <Spinner size={10} />
                    Saving…
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  icon={preview ? <EyeOff size={12} /> : <Eye size={12} />}
                  onClick={togglePreview}
                  title={preview ? 'Switch to source (markdown)' : 'Switch to preview'}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Download size={12} />}
                  onClick={() => handleDownload(selected)}
                />
              </div>
            </div>
          )}

          {contentLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Spinner size={20} />
            </div>
          ) : content && selected ? (
            <div className="flex-1 overflow-hidden">
              {preview ? (
                <div className="h-full overflow-y-auto" style={{ padding: '32px 40px' }}>
                  <div className="max-w-[680px] mx-auto mc-prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {editContent}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : (
                <CodeMirrorEditor
                  content={editContent}
                  onChange={handleEditorChange}
                />
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={<FileText size={32} />}
                title="Select a file to edit"
                subtitle="Choose a document from the sidebar"
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
