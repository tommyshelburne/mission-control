'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { FileText, Eye, EyeOff, Download, MoreHorizontal, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { CodeMirrorEditor } from '@/components/docs/CodeMirrorEditor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DocEntry {
  path: string;
  title: string;
  category: string;
  size: number;
  words: number;
  modified: number;
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

export default function DocsPage() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [filtered, setFiltered] = useState<DocEntry[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<DocContent | null>(null);
  const [editContent, setEditContent] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [newFileInput, setNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load docs list
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/docs');
        if (res.ok) {
          const data = await res.json();
          setDocs(data.docs);
          setFiltered(data.docs);
        }
      } catch {
        // silently fail
      } finally {
        setListLoading(false);
      }
    }
    load();
  }, []);

  // Filter by search
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(docs);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(docs.filter((d) =>
      d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q)
    ));
  }, [search, docs]);

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
    // Restore per-file preview preference (defaults to source/edit mode)
    try {
      setPreview(localStorage.getItem(`mc.docs.preview.${filePath}`) === '1');
    } catch {
      setPreview(false);
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
      }
    } catch {
      // silently fail
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

  const handleNewFile = useCallback(async () => {
    const name = newFileName.trim();
    if (!name) return;
    const filename = name.endsWith('.md') ? name : name + '.md';
    const filePath = `/home/claw/.openclaw/workspace/projects/notes/${filename}`;
    try {
      const res = await fetch('/api/docs/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: `# ${name.replace(/\.md$/, '')}\n\n` }),
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
        };
        setDocs((prev) => [newDoc, ...prev]);
        setNewFileInput(false);
        setNewFileName('');
        loadFile(data.path);
      }
    } catch {
      // silently fail
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

  const groups = groupByCategory(filtered);
  const breadcrumb = selected ? selected.replace('/home/claw/.openclaw/workspace/', '') : '';

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
              Array.from(groups.entries()).map(([category, items]) => (
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
                    <span className="ml-auto text-[var(--text-muted)]">{items.length}</span>
                  </button>
                  {!collapsedGroups.has(category) &&
                    items.map((doc) => (
                      <div
                        key={doc.path}
                        className="group relative h-9 flex items-center justify-between px-3 cursor-pointer hover:bg-[var(--bg-hover)]"
                        style={{
                          background: selected === doc.path ? 'var(--bg-elevated)' : undefined,
                          borderLeft: selected === doc.path
                            ? '2px solid var(--accent)'
                            : '2px solid transparent',
                          transition: 'background 80ms ease',
                        }}
                        onClick={() => loadFile(doc.path)}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText size={12} className="text-[var(--text-muted)] flex-shrink-0" />
                          <span className="text-12 text-[var(--text-primary)] truncate">
                            {doc.title}
                          </span>
                        </div>
                        <span className="text-10 text-[var(--text-muted)] flex-shrink-0 group-hover:hidden">
                          {doc.words.toLocaleString()}
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
                    ))}
                </div>
              ))
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
                  <span className="text-11 text-[var(--success)]">Saved</span>
                )}
                {saveStatus === 'unsaved' && (
                  <span className="text-11 text-[var(--warning)]">Unsaved</span>
                )}
                {saveStatus === 'saving' && (
                  <span className="text-11 text-[var(--text-muted)]">Saving...</span>
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
