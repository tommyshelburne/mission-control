'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen, Pencil, Archive, Trash2, Plus, MoreHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, EmptyState, Spinner } from '@/components/ui';

interface Project {
  id: number;
  name: string;
  description: string;
  goal: string;
  status: string;
  color: string;
  due_date: string;
  created_at: string;
  updated_at: string;
  tasks_open: number;
  tasks_done: number;
  task_count: number;
}

type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived';

const STATUS_OPTIONS: ProjectStatus[] = ['planning', 'active', 'paused', 'completed', 'archived'];

const STATUS_BADGE_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'accent' | 'muted'> = {
  planning: 'neutral',
  active: 'success',
  paused: 'warning',
  completed: 'accent',
  archived: 'muted',
};

const COLOR_PRESETS = ['#5b5bd6', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

function formatDueDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dueDateColor(dateStr: string): string {
  if (!dateStr) return 'var(--text-muted)';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(dateStr + 'T12:00:00');
  const diffMs = due.getTime() - today.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'var(--danger)';
  if (diffDays <= 3) return 'var(--warning)';
  return 'var(--text-muted)';
}

interface ProjectFormData {
  name: string;
  goal: string;
  status: ProjectStatus;
  color: string;
  due_date: string;
}

const emptyForm: ProjectFormData = {
  name: '',
  goal: '',
  status: 'planning',
  color: '#5b5bd6',
  due_date: '',
};

function ProjectForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: ProjectFormData;
  onSave: (data: ProjectFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ProjectFormData>(initial);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        placeholder="Project name *"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 h-8 text-13 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] w-full"
      />
      <input
        type="text"
        placeholder="Goal"
        value={form.goal}
        onChange={(e) => setForm({ ...form, goal: e.target.value })}
        className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 h-8 text-13 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] w-full"
      />
      <div className="flex items-center gap-3">
        <select
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-2 h-8 text-13 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ ...form, color: c })}
              className={`rounded-full cursor-pointer flex-shrink-0 ${
                form.color === c
                  ? 'ring-2 ring-offset-2 ring-offset-[var(--bg-surface)]'
                  : ''
              }`}
              style={{
                width: 20,
                height: 20,
                backgroundColor: c,
                ...(form.color === c
                  ? { outline: `2px solid ${c}`, outlineOffset: 2 }
                  : {}),
              }}
            />
          ))}
        </div>

        <input
          type="date"
          value={form.due_date}
          onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-2 h-8 text-13 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => onSave(form)}
          disabled={!form.name.trim() || saving}
          loading={saving}
        >
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onEdit,
  onArchive,
  onDelete,
  editingId,
  onSaveEdit,
  onCancelEdit,
  saving,
}: {
  project: Project;
  onEdit: (id: number) => void;
  onArchive: (p: Project) => void;
  onDelete: (id: number) => void;
  editingId: number | null;
  onSaveEdit: (id: number, data: ProjectFormData) => void;
  onCancelEdit: () => void;
  saving: boolean;
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isEditing = editingId === project.id;

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const progress =
    project.task_count > 0
      ? Math.round((project.tasks_done / project.task_count) * 100)
      : 0;

  if (isEditing) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
        <ProjectForm
          initial={{
            name: project.name,
            goal: project.goal || '',
            status: project.status as ProjectStatus,
            color: project.color || 'var(--accent)',
            due_date: project.due_date || '',
          }}
          onSave={(data) => onSaveEdit(project.id, data)}
          onCancel={onCancelEdit}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <div
      className="project-card border rounded-lg p-4 h-[148px] overflow-hidden relative cursor-pointer flex flex-col"
      onClick={() => router.push(`/tasks?project=${encodeURIComponent(project.name)}`)}
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--glass-border)',
      }}
    >
      {/* Row 1: Color dot + Name + Status badge */}
      <div className="flex items-center gap-2">
        <span
          className="flex-shrink-0 rounded-full"
          style={{ width: 8, height: 8, backgroundColor: project.color || 'var(--accent)' }}
        />
        <span className="text-14 font-semibold text-[var(--text-primary)] flex-1 truncate">
          {project.name}
        </span>
        <Badge
          label={project.status}
          variant={STATUS_BADGE_VARIANT[project.status] || 'neutral'}
          size="xs"
        />
      </div>

      {/* Row 2: Goal */}
      <p className="text-12 text-[var(--text-secondary)] truncate mt-1 min-h-[18px]">
        {project.goal || ''}
      </p>

      {/* Push remaining content to bottom */}
      <div className="mt-auto">
        {/* Row 3: Progress bar */}
        <div className="w-full bg-[var(--border-mid)] rounded-full overflow-hidden mb-1.5" style={{ height: 3 }}>
          <div
            className="h-full bg-[var(--accent)] rounded-full"
            style={{ width: `${progress}%`, transition: 'width 200ms ease' }}
          />
        </div>

        {/* Row 4: Stats + due date + ··· menu */}
        <div className="flex items-center justify-between">
          <span className="text-11 text-[var(--text-muted)]">
            {project.tasks_open} open &middot; {project.tasks_done} done
            {project.due_date && (
              <span className="ml-2" style={{ color: dueDateColor(project.due_date) }}>
                · {formatDueDate(project.due_date)}
              </span>
            )}
          </span>

          {/* ··· actions menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(m => !m); }}
              className="flex items-center justify-center w-6 h-6 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors duration-[80ms]"
              title="Actions"
              aria-label="Project actions"
            >
              <MoreHorizontal size={13} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 bottom-7 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md z-10 min-w-[128px] py-1" style={{ boxShadow: 'var(--shadow-md)' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(project.id); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-11 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <Pencil size={11} /> Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onArchive(project); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-11 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <Archive size={11} /> {project.status === 'archived' ? 'Unarchive' : 'Archive'}
                </button>
                {confirmDelete ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(project.id); setMenuOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-11 text-[var(--danger)] hover:bg-[var(--danger-dim)] cursor-pointer"
                  >
                    <Trash2 size={11} /> Confirm delete
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(true);
                      setTimeout(() => setConfirmDelete(false), 3000);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-11 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--danger)] cursor-pointer"
                  >
                    <Trash2 size={11} /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (form: ProjectFormData) => {
    setSaving(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setCreating(false);
        fetchProjects();
      }
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (id: number, form: ProjectFormData) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setEditingId(null);
        fetchProjects();
      }
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (project: Project) => {
    const newStatus = project.status === 'archived' ? 'active' : 'archived';
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchProjects();
    } catch {
      // Silently fail
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      fetchProjects();
    } catch {
      // Silently fail
    }
  };

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={loading ? '' : `${projects.length} projects`}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={13} />}
            onClick={() => {
              setCreating(true);
              setEditingId(null);
            }}
          >
            New Project
          </Button>
        }
      />

      {/* Create form */}
      {creating && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 mx-6 mt-4">
          <ProjectForm
            initial={emptyForm}
            onSave={handleCreate}
            onCancel={() => setCreating(false)}
            saving={saving}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={20} />
          </div>
        ) : projects.length === 0 && !creating ? (
          <EmptyState
            icon={<FolderOpen size={32} />}
            title="No projects yet"
            subtitle="Create your first project to get started"
            action={{ label: 'New Project', onClick: () => setCreating(true) }}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 p-6">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={(id) => {
                  setEditingId(id);
                  setCreating(false);
                }}
                onArchive={handleArchive}
                onDelete={handleDelete}
                editingId={editingId}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={() => setEditingId(null)}
                saving={saving}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
