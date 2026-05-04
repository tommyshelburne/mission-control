'use client';

import { useState, useCallback, useRef, useMemo, Suspense, memo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, InlineEdit, Select, DatePicker, SlidePanel, Spinner } from '@/components/ui';
import { X } from 'lucide-react';

/* ---------- types ---------- */

interface Task {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  project: string;
  project_id: number | null;
  parent_id: number | null;
  due_date: string;
  position: number;
  created_at: string;
  updated_at: string;
}

interface Project {
  id: number;
  name: string;
}

const COLUMNS: { key: string; label: string }[] = [
  { key: 'todo', label: 'Todo' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
];

const ASSIGNEES = ['Tommy', 'Claw', 'Rex', 'Scout', 'Herald', 'Quill', 'Coach', 'Warden'];

const STATUS_OPTIONS = COLUMNS.map(c => ({ value: c.key, label: c.label }));
const ASSIGNEE_OPTIONS = ASSIGNEES.map(a => ({ value: a, label: a }));
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const DONE_PAGE_SIZE = 15;

/* ---------- helpers ---------- */

function dueDateColor(dateStr: string): string {
  if (!dateStr) return 'text-[var(--text-muted)]';
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T12:00:00');
  d.setHours(0, 0, 0, 0);
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'text-[var(--danger)]';
  if (diff <= 2) return 'text-[var(--warning)]';
  return 'text-[var(--text-muted)]';
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTimestamp(ts: string): string {
  if (!ts) return '--';
  const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T');
  const d = new Date(normalized);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const PRIORITY_DOT_COLORS: Record<string, string> = {
  urgent: 'var(--danger)',
  high:   'var(--warning)',
  medium: 'var(--info)',
  low:    'var(--text-muted)',
};

/* ---------- position helpers ---------- */

function computeNewPosition(columnTasks: Task[], toIndex: number): number {
  const sorted = [...columnTasks].sort((a, b) => a.position - b.position);
  const prev = sorted[toIndex - 1]?.position ?? 0;
  const next = sorted[toIndex]?.position ?? (prev + 2000);
  return (prev + next) / 2;
}

function needsRebalance(tasks: Task[]): boolean {
  const sorted = [...tasks].sort((a, b) => a.position - b.position);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].position - sorted[i - 1].position < 0.001) return true;
  }
  return false;
}

function rebalance(tasks: Task[]): Task[] {
  const sorted = [...tasks].sort((a, b) => a.position - b.position);
  return sorted.map((t, i) => ({ ...t, position: (i + 1) * 1000 }));
}

/* ---------- KanbanCard (sortable) ---------- */

const KanbanCard = memo(function KanbanCard({
  task,
  subtaskStats,
  onClick,
}: {
  task: Task;
  subtaskStats?: { total: number; done: number };
  onClick?: (task: Task) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const dotColor = PRIORITY_DOT_COLORS[task.priority] ?? null;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: '12px 14px',
    height: 96,
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.03), transparent)',
    backdropFilter: 'blur(8px)',
    border: `1px solid var(--glass-border)`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    cursor: isDragging ? 'grabbing' : 'grab',
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="task-card border rounded-md flex flex-col select-none"
      onClick={() => !isDragging && onClick?.(task)}
    >
      {dotColor && (
        <span
          className="absolute rounded-full"
          style={{ top: 8, right: 8, width: 6, height: 6, backgroundColor: dotColor }}
        />
      )}
      <div
        className="text-13 text-[var(--text-primary)] overflow-hidden"
        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontWeight: 500, paddingRight: dotColor ? 14 : 0 }}
      >
        {task.title}
      </div>
      <div className="flex items-center gap-2 mt-auto">
        <span className="text-10 text-[var(--text-muted)] flex-shrink-0">#{task.id}</span>
        {task.project && <Badge label={task.project} variant="neutral" size="xs" />}
        {subtaskStats && subtaskStats.total > 0 && (
          <Badge
            label={`${subtaskStats.done}/${subtaskStats.total}`}
            variant={subtaskStats.done === subtaskStats.total ? 'success' : 'neutral'}
            size="xs"
          />
        )}
        <span className="flex-1" />
        {task.assignee && <span className="text-11 text-[var(--text-muted)]">{task.assignee}</span>}
        {task.due_date && <span className={`text-11 ${dueDateColor(task.due_date)}`}>{formatShortDate(task.due_date)}</span>}
      </div>
    </div>
  );
});

/* ---------- DragOverlayCard ---------- */

function DragOverlayCard({ task }: { task: Task }) {
  const dotColor = PRIORITY_DOT_COLORS[task.priority] ?? null;
  return (
    <div
      className="task-card border rounded-md flex flex-col select-none"
      style={{
        padding: '12px 14px',
        height: 96,
        borderRadius: 'var(--radius-md)',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--accent)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
        transform: 'scale(1.02) rotate(0.5deg)',
        cursor: 'grabbing',
        position: 'relative',
        opacity: 1,
      }}
    >
      {dotColor && (
        <span
          className="absolute rounded-full"
          style={{ top: 8, right: 8, width: 6, height: 6, backgroundColor: dotColor }}
        />
      )}
      <div
        className="text-13 text-[var(--text-primary)] overflow-hidden"
        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontWeight: 500, paddingRight: dotColor ? 14 : 0 }}
      >
        {task.title}
      </div>
      <div className="flex items-center gap-2 mt-auto">
        <span className="text-10 text-[var(--text-muted)] flex-shrink-0">#{task.id}</span>
        {task.project && <Badge label={task.project} variant="neutral" size="xs" />}
        <span className="flex-1" />
        {task.assignee && <span className="text-11 text-[var(--text-muted)]">{task.assignee}</span>}
        {task.due_date && <span className={`text-11 ${dueDateColor(task.due_date)}`}>{formatShortDate(task.due_date)}</span>}
      </div>
    </div>
  );
}

/* ---------- KanbanColumn ---------- */

interface KanbanColumnProps {
  colKey: string;
  label: string;
  tasks: Task[];
  totalDone?: number;
  doneVisible?: number;
  onLoadMore?: () => void;
  onAddTask?: () => void;
  addingTask?: boolean;
  newTaskRef?: React.RefObject<HTMLInputElement>;
  onNewTaskCommit?: (title: string) => void;
  onNewTaskDiscard?: () => void;
  onTaskClick: (task: Task) => void;
  isOver?: boolean;
  subtaskStats?: Record<number, { total: number; done: number }>;
}

function KanbanColumn({
  colKey,
  label,
  tasks,
  totalDone,
  doneVisible,
  onLoadMore,
  onAddTask,
  addingTask,
  newTaskRef,
  onNewTaskCommit,
  onNewTaskDiscard,
  onTaskClick,
  subtaskStats,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: colKey });

  const taskIds = useMemo(() => tasks.map(t => t.id), [tasks]);

  const badgeLabel = useMemo(() => {
    if (colKey === 'done' && totalDone !== undefined && doneVisible !== undefined && totalDone > doneVisible) {
      return `${doneVisible}/${totalDone}`;
    }
    return String(tasks.length);
  }, [colKey, tasks.length, totalDone, doneVisible]);

  return (
    <div
      className="flex flex-col w-[300px] min-w-[300px] gap-2 rounded-lg"
      style={{
        background: isOver ? 'rgba(99,102,241,0.06)' : 'transparent',
        outline: isOver ? '1.5px solid rgba(99,102,241,0.3)' : '1.5px solid transparent',
        padding: '0 4px 8px',
      }}
    >
      {/* column header */}
      <div className="flex items-center justify-between mb-2 pb-2" style={{ height: 36, borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-11 uppercase text-[var(--text-muted)]" style={{ fontWeight: 500, letterSpacing: '0.06em' }}>
            {label}
          </span>
          <Badge label={badgeLabel} variant="neutral" size="xs" />
        </div>
        {colKey === 'todo' && (
          <Button variant="ghost" size="sm" onClick={onAddTask}>
            + New
          </Button>
        )}
      </div>

      {/* column body — droppable target + sortable context */}
      <div ref={setNodeRef} className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
        {/* new task input */}
        {colKey === 'todo' && addingTask && (
          <div className="bg-[var(--bg-card)] border border-[var(--accent)] rounded-md p-[12px_14px] h-[96px]">
            <input
              ref={newTaskRef}
              type="text"
              placeholder="Task title..."
              className="w-full bg-transparent text-13 text-[var(--text-primary)] outline-none"
              onBlur={e => onNewTaskCommit?.(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onNewTaskCommit?.((e.target as HTMLInputElement).value);
                if (e.key === 'Escape') onNewTaskDiscard?.();
              }}
            />
          </div>
        )}

        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <KanbanCard
              key={task.id}
              task={task}
              subtaskStats={subtaskStats?.[task.id]}
              onClick={onTaskClick}
            />
          ))}
        </SortableContext>

        {colKey === 'done' && totalDone !== undefined && doneVisible !== undefined && totalDone > doneVisible && (
          <button
            className="text-11 text-[var(--text-muted)] hover:text-[var(--text-primary)] py-2 text-center w-full cursor-pointer transition-colors duration-[80ms]"
            onClick={onLoadMore}
          >
            Load more ({totalDone - doneVisible} remaining)
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- wrapper for Suspense ---------- */

export default function TasksPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center flex-1"><Spinner size={20} /></div>}>
      <TasksPage />
    </Suspense>
  );
}

/* ---------- main component ---------- */

function TasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectFilter = searchParams.get('project') || '';
  const queryClient = useQueryClient();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [doneVisible, setDoneVisible] = useState(DONE_PAGE_SIZE);
  const [prevProjectFilter, setPrevProjectFilter] = useState(projectFilter);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const newTaskRef = useRef<HTMLInputElement>(null);

  /* Reset doneVisible when filter changes (computed during render, avoids setState-in-effect) */
  if (prevProjectFilter !== projectFilter) {
    setPrevProjectFilter(projectFilter);
    setDoneVisible(DONE_PAGE_SIZE);
  }

  /* Focus new task input after state flip */
  useEffect(() => {
    if (addingTask && newTaskRef.current) {
      newTaskRef.current.focus();
    }
  }, [addingTask]);

  /* ---------- sensors ---------- */

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  /* ---------- queries ---------- */

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () => fetch('/api/tasks').then(r => r.json()).then(d => d.tasks ?? []),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then(r => r.json()).then(d => d.projects ?? []).catch(() => []),
    staleTime: 60_000,
  });

  /* ---------- derived data ---------- */

  // Kanban shows only top-level tasks; subtasks live inside the detail panel of their parent.
  const topLevel = useMemo(() => tasks.filter(t => t.parent_id == null), [tasks]);

  const displayed = useMemo(
    () => projectFilter ? topLevel.filter(t => t.project === projectFilter) : topLevel,
    [topLevel, projectFilter]
  );

  // Subtask progress per parent — { parentId: { total, done } }
  const subtaskStats = useMemo(() => {
    const m: Record<number, { total: number; done: number }> = {};
    for (const t of tasks) {
      if (t.parent_id != null) {
        if (!m[t.parent_id]) m[t.parent_id] = { total: 0, done: 0 };
        m[t.parent_id].total++;
        if (t.status === 'done') m[t.parent_id].done++;
      }
    }
    return m;
  }, [tasks]);

  const totalDone = useMemo(
    () => displayed.filter(t => t.status === 'done').length,
    [displayed]
  );

  const grouped = useMemo(
    () => COLUMNS.reduce<Record<string, Task[]>>((acc, col) => {
      const colTasks = displayed
        .filter(t => t.status === col.key)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      acc[col.key] = col.key === 'done' ? colTasks.slice(0, doneVisible) : colTasks;
      return acc;
    }, {}),
    [displayed, doneVisible]
  );

  /* ---------- mutations ---------- */

  const patchMutation = useMutation({
    mutationFn: ({ id, fields }: { id: number; fields: Partial<Task> }) =>
      fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      }).then(r => r.json()),
    onMutate: async ({ id, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const prev = queryClient.getQueryData<Task[]>(['tasks']);
      queryClient.setQueryData<Task[]>(['tasks'], old =>
        (old ?? []).map(t => t.id === id ? { ...t, ...fields } : t)
      );
      setSelectedTask(cur => cur && cur.id === id ? { ...cur, ...fields } : cur);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tasks'], ctx.prev);
    },
  });

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }).then(r => r.json()),
    onMutate: async (title) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const prev = queryClient.getQueryData<Task[]>(['tasks']);
      const placeholder: Task = {
        id: -Date.now(),
        title,
        description: '',
        status: 'todo',
        priority: 'medium',
        assignee: '',
        project: projectFilter,
        project_id: null,
        parent_id: null,
        due_date: '',
        position: -Infinity,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      queryClient.setQueryData<Task[]>(['tasks'], old => [placeholder, ...(old ?? [])]);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tasks'], ctx.prev);
    },
    onSuccess: (newTask) => {
      queryClient.setQueryData<Task[]>(['tasks'], old =>
        (old ?? []).map(t => t.id < 0 ? newTask : t)
      );
    },
  });

  const createSubtaskMutation = useMutation({
    mutationFn: ({ title, parent_id }: { title: string; parent_id: number }) =>
      fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parent_id, status: 'todo', priority: 'medium' }),
      }).then(r => r.json()),
    onSuccess: (newTask) => {
      queryClient.setQueryData<Task[]>(['tasks'], old => [...(old ?? []), newTask]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/tasks/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const prev = queryClient.getQueryData<Task[]>(['tasks']);
      queryClient.setQueryData<Task[]>(['tasks'], old => (old ?? []).filter(t => t.id !== id));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tasks'], ctx.prev);
    },
  });

  /* ---------- drag and drop ---------- */

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const taskId = Number(event.active.id);
    const allTasks = queryClient.getQueryData<Task[]>(['tasks']) ?? [];
    const task = allTasks.find(t => t.id === taskId) ?? null;
    setActiveTask(task);
  }, [queryClient]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = Number(active.id);
    const allTasks = queryClient.getQueryData<Task[]>(['tasks']) ?? [];
    const draggedTask = allTasks.find(t => t.id === taskId);
    if (!draggedTask) return;

    // Determine destination column: over could be a column id or a task id
    const overId = over.id;
    const overIsColumn = COLUMNS.some(c => c.key === overId);
    const newStatus = overIsColumn
      ? String(overId)
      : (allTasks.find(t => t.id === Number(overId))?.status ?? draggedTask.status);

    // Destination column tasks (excluding dragged card)
    const destColTasks = allTasks
      .filter(t => t.status === newStatus && t.id !== taskId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    // Determine target index
    let toIndex: number;
    if (overIsColumn) {
      toIndex = destColTasks.length;
    } else {
      const overIndex = destColTasks.findIndex(t => t.id === Number(overId));
      toIndex = overIndex >= 0 ? overIndex : destColTasks.length;
    }

    // No change
    if (newStatus === draggedTask.status && toIndex === destColTasks.findIndex(t => t.id === taskId)) return;

    let newPosition = computeNewPosition(destColTasks, toIndex);

    // Rebalance if precision is getting tight
    let rebalancedTasks: Task[] | null = null;
    const destAll = allTasks.filter(t => t.status === newStatus && t.id !== taskId);
    const testTasks = [...destAll, { id: taskId, position: newPosition } as Task];
    if (needsRebalance(testTasks)) {
      const rebalanced = rebalance(testTasks);
      newPosition = rebalanced.find(t => t.id === taskId)?.position ?? newPosition;
      rebalancedTasks = rebalanced;
    }

    // Optimistic update
    queryClient.setQueryData<Task[]>(['tasks'], old => {
      if (!old) return old;
      if (rebalancedTasks) {
        const rebalancedById = Object.fromEntries(rebalancedTasks.map(t => [t.id, t.position]));
        return old.map(t => {
          if (t.id === taskId) return { ...t, status: newStatus, position: newPosition };
          if (rebalancedById[t.id] !== undefined) return { ...t, position: rebalancedById[t.id] };
          return t;
        });
      }
      return old.map(t => t.id === taskId ? { ...t, status: newStatus, position: newPosition } : t);
    });

    // Fire API in background
    const fieldsToUpdate: Partial<Task> = { position: newPosition };
    if (newStatus !== draggedTask.status) fieldsToUpdate.status = newStatus;

    fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fieldsToUpdate),
    }).catch(() => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });

    // Fire rebalance patches in background
    if (rebalancedTasks) {
      for (const t of rebalancedTasks) {
        if (t.id !== taskId) {
          fetch(`/api/tasks/${t.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position: t.position }),
          }).catch(() => {});
        }
      }
    }
  }, [queryClient]);

  /* ---------- handlers ---------- */

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTask(task);
    setConfirmDelete(false);
  }, []);

  const handleFieldChange = useCallback((field: string, value: string) => {
    if (!selectedTask) return;
    patchMutation.mutate({ id: selectedTask.id, fields: { [field]: value } });
  }, [selectedTask, patchMutation]);

  const handleDelete = useCallback(async () => {
    if (!selectedTask) return;
    deleteMutation.mutate(selectedTask.id);
    setSelectedTask(null);
    setConfirmDelete(false);
  }, [selectedTask, deleteMutation]);

  const handleNewTaskCommit = useCallback((title: string) => {
    setAddingTask(false);
    if (!title.trim()) return;
    createMutation.mutate(title.trim());
  }, [createMutation]);

  const handleNewTaskDiscard = useCallback(() => {
    setAddingTask(false);
  }, []);

  const clearFilter = useCallback(() => router.push('/tasks'), [router]);

  /* ---------- derived options ---------- */

  const projectOptions = useMemo(() => [
    { value: '', label: 'No project' },
    ...projects.map(p => ({ value: p.name, label: p.name })),
  ], [projects]);

  /* ---------- render ---------- */

  return (
    <>
      <PageHeader
        title="Tasks"
        actions={
          <div className="flex items-center gap-2">
            {projectFilter && (
              <button
                onClick={clearFilter}
                className="inline-flex items-center gap-1 text-11 px-2 py-0.5 rounded bg-[var(--accent-dim)] text-[var(--accent)] hover:bg-[rgba(99,102,241,0.2)] transition-colors"
              >
                {projectFilter}
                <X size={10} />
              </button>
            )}
            <Badge label={`${displayed.length} tasks`} variant="neutral" size="xs" />
          </div>
        }
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-row gap-3 p-6 flex-1 overflow-auto items-start">
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.key}
              colKey={col.key}
              label={col.label}
              tasks={grouped[col.key] ?? []}
              totalDone={col.key === 'done' ? totalDone : undefined}
              doneVisible={col.key === 'done' ? doneVisible : undefined}
              onLoadMore={() => setDoneVisible(v => v + DONE_PAGE_SIZE)}
              onAddTask={() => setAddingTask(true)}
              addingTask={addingTask}
              newTaskRef={newTaskRef}
              onNewTaskCommit={handleNewTaskCommit}
              onNewTaskDiscard={handleNewTaskDiscard}
              onTaskClick={handleTaskClick}
              subtaskStats={subtaskStats}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? <DragOverlayCard task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>

      {/* slide panel */}
      <SlidePanel
        open={!!selectedTask}
        onClose={() => { setSelectedTask(null); setConfirmDelete(false); }}
      >
        {selectedTask && (
          <div className="flex flex-col gap-5">
            <InlineEdit
              value={selectedTask.title}
              onSave={val => handleFieldChange('title', val)}
              textSize="text-16"
              textWeight="font-semibold"
            />

            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <div>
                <div className="text-11 text-[var(--text-muted)]" style={{ fontWeight: 400, marginBottom: 4 }}>Status</div>
                <Select
                  value={selectedTask.status}
                  options={STATUS_OPTIONS}
                  onChange={val => handleFieldChange('status', val)}
                  placeholder=""
                  aria-label="Task status"
                />
              </div>
              <div>
                <div className="text-11 text-[var(--text-muted)]" style={{ fontWeight: 400, marginBottom: 4 }}>Assignee</div>
                <Select
                  value={selectedTask.assignee}
                  options={ASSIGNEE_OPTIONS}
                  onChange={val => handleFieldChange('assignee', val)}
                  placeholder="Unassigned"
                  aria-label="Assignee"
                />
              </div>
              <div>
                <div className="text-11 text-[var(--text-muted)]" style={{ fontWeight: 400, marginBottom: 4 }}>Priority</div>
                <Select
                  value={selectedTask.priority}
                  options={PRIORITY_OPTIONS}
                  onChange={val => handleFieldChange('priority', val)}
                  placeholder=""
                  aria-label="Priority"
                />
              </div>
              <div>
                <div className="text-11 text-[var(--text-muted)]" style={{ fontWeight: 400, marginBottom: 4 }}>Project</div>
                <Select
                  value={selectedTask.project}
                  options={projectOptions}
                  onChange={val => handleFieldChange('project', val)}
                  placeholder=""
                  aria-label="Project"
                />
              </div>
              <div>
                <div className="text-11 text-[var(--text-muted)]" style={{ fontWeight: 400, marginBottom: 4 }}>Due date</div>
                <DatePicker
                  value={selectedTask.due_date}
                  onChange={val => handleFieldChange('due_date', val)}
                />
              </div>
            </div>

            <div>
              <div className="text-11 text-[var(--text-muted)]" style={{ fontWeight: 400, marginBottom: 4 }}>Description</div>
              <InlineEdit
                value={selectedTask.description}
                onSave={val => handleFieldChange('description', val)}
                multiline
                textSize="text-13"
                placeholder="Add a description..."
              />
            </div>

            {selectedTask.parent_id == null && (
              <SubtasksSection
                parent={selectedTask}
                allTasks={tasks}
                onToggle={(id, done) => patchMutation.mutate({ id, fields: { status: done ? 'done' : 'todo' } })}
                onDelete={(id) => deleteMutation.mutate(id)}
                onCreate={(title) => createSubtaskMutation.mutate({ title, parent_id: selectedTask.id })}
                onOpen={(t) => setSelectedTask(t)}
              />
            )}

            <div className="flex gap-6 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <div>
                <div className="text-11 text-[var(--text-muted)]">Created</div>
                <div className="text-11 text-[var(--text-muted)]">{formatTimestamp(selectedTask.created_at)}</div>
              </div>
              <div>
                <div className="text-11 text-[var(--text-muted)]">Updated</div>
                <div className="text-11 text-[var(--text-muted)]">{formatTimestamp(selectedTask.updated_at)}</div>
              </div>
            </div>

            <div className="pt-2">
              {!confirmDelete ? (
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  Delete task
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-12 text-[var(--text-secondary)]">Are you sure?</span>
                  <Button variant="danger" size="sm" onClick={handleDelete}>
                    Confirm
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </SlidePanel>
    </>
  );
}

/* ---------- SubtasksSection ---------- */

function SubtasksSection({
  parent,
  allTasks,
  onToggle,
  onDelete,
  onCreate,
  onOpen,
}: {
  parent: Task;
  allTasks: Task[];
  onToggle: (id: number, done: boolean) => void;
  onDelete: (id: number) => void;
  onCreate: (title: string) => void;
  onOpen: (task: Task) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const subtasks = useMemo(
    () => allTasks
      .filter(t => t.parent_id === parent.id)
      .sort((a, b) => {
        const aDone = a.status === 'done' ? 1 : 0;
        const bDone = b.status === 'done' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return (a.position ?? 0) - (b.position ?? 0);
      }),
    [allTasks, parent.id],
  );
  const done = subtasks.filter(t => t.status === 'done').length;

  const commit = () => {
    const v = draft.trim();
    if (v) onCreate(v);
    setDraft('');
    setAdding(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-11 text-[var(--text-muted)]" style={{ fontWeight: 400 }}>
          Subtasks {subtasks.length > 0 && <span>({done}/{subtasks.length})</span>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>+ Subtask</Button>
      </div>

      <div className="flex flex-col gap-1">
        {subtasks.map(t => (
          <div
            key={t.id}
            className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--bg-elevated)]"
            style={{ border: '1px solid transparent' }}
          >
            <input
              type="checkbox"
              checked={t.status === 'done'}
              onChange={(e) => onToggle(t.id, e.target.checked)}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <button
              onClick={() => onOpen(t)}
              className="flex-1 text-left truncate"
              style={{
                fontSize: 13,
                color: t.status === 'done' ? 'var(--text-muted)' : 'var(--text-primary)',
                textDecoration: t.status === 'done' ? 'line-through' : 'none',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {t.title}
            </button>
            <button
              onClick={() => onDelete(t.id)}
              className="opacity-0 group-hover:opacity-100"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, fontSize: 12 }}
              aria-label="Delete subtask"
            >
              ×
            </button>
          </div>
        ))}
        {adding && (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setDraft(''); setAdding(false); }
            }}
            placeholder="Subtask title..."
            className="mx-2"
            style={{
              fontSize: 13,
              background: 'var(--bg-card)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-primary)',
              padding: '6px 10px',
              outline: 'none',
            }}
          />
        )}
        {subtasks.length === 0 && !adding && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>
            No subtasks yet.
          </div>
        )}
      </div>
    </div>
  );
}
