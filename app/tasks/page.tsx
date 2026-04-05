'use client';

import { useState, useCallback, useRef, useMemo, Suspense, memo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
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

const ASSIGNEES = ['Tommy', 'Claw', 'Rex', 'Scout', 'Atlas', 'Herald', 'Lens', 'Quill', 'Coach', 'Warden'];

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

/* ---------- memoized task card ---------- */

const TaskCard = memo(function TaskCard({
  task,
  index,
  onClick,
}: {
  task: Task;
  index: number;
  onClick: (task: Task) => void;
}) {
  const dotColor = PRIORITY_DOT_COLORS[task.priority] ?? null;

  return (
    <Draggable draggableId={String(task.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(task)}
          className="task-card relative border rounded-md flex flex-col select-none"
          style={{
            ...provided.draggableProps.style,
            padding: '12px 14px',
            height: 96,
            borderRadius: 'var(--radius-md)',
            background: snapshot.isDragging
              ? 'var(--glass-bg)'
              : 'linear-gradient(135deg, rgba(255,255,255,0.03), transparent)',
            backdropFilter: 'blur(8px)',
            border: `1px solid ${snapshot.isDragging ? 'var(--accent)' : 'var(--glass-border)'}`,
            boxShadow: snapshot.isDragging ? '0 16px 48px rgba(0,0,0,0.7)' : '0 1px 3px rgba(0,0,0,0.3)',
            transition: 'border-color 200ms ease, box-shadow 200ms ease, transform 180ms ease, background 200ms ease',
            transform: snapshot.isDragging ? 'scale(1.02) rotate(0.5deg)' : undefined,
            cursor: snapshot.isDragging ? 'grabbing' : 'grab',
            animation: `fade-in-up 200ms ease forwards`,
            animationDelay: `${index * 20}ms`,
            opacity: 0,
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
      )}
    </Draggable>
  );
});

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
}: KanbanColumnProps) {
  const badgeLabel = useMemo(() => {
    if (colKey === 'done' && totalDone !== undefined && doneVisible !== undefined && totalDone > doneVisible) {
      return `${doneVisible}/${totalDone}`;
    }
    return String(tasks.length);
  }, [colKey, tasks.length, totalDone, doneVisible]);

  return (
    <Droppable droppableId={colKey}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className="flex flex-col w-[300px] min-w-[300px] gap-2 rounded-lg"
          style={{
            background: snapshot.isDraggingOver ? 'rgba(99,102,241,0.06)' : 'transparent',
            outline: snapshot.isDraggingOver ? '1.5px solid rgba(99,102,241,0.3)' : '1.5px solid transparent',
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

          {/* column body */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
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

            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={addingTask && colKey === 'todo' ? index + 1 : index}
                onClick={onTaskClick}
              />
            ))}

            {colKey === 'done' && totalDone !== undefined && doneVisible !== undefined && totalDone > doneVisible && (
              <button
                className="text-11 text-[var(--text-muted)] hover:text-[var(--text-primary)] py-2 text-center w-full cursor-pointer transition-colors duration-[80ms]"
                onClick={onLoadMore}
              >
                Load more ({totalDone - doneVisible} remaining)
              </button>
            )}

            {provided.placeholder}
          </div>
        </div>
      )}
    </Droppable>
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
  const newTaskRef = useRef<HTMLInputElement>(null);

  /* Reset doneVisible when filter changes */
  useEffect(() => {
    setDoneVisible(DONE_PAGE_SIZE);
  }, [projectFilter]);

  /* Focus new task input after state flip */
  useEffect(() => {
    if (addingTask && newTaskRef.current) {
      newTaskRef.current.focus();
    }
  }, [addingTask]);

  /* ---------- queries ---------- */

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () => fetch('/api/tasks').then(r => r.json()).then(d => d.tasks ?? []),
    staleTime: 5 * 60_000, // 5 min — don't refetch and stomp optimistic state
    refetchOnWindowFocus: false,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then(r => r.json()).then(d => d.projects ?? []).catch(() => []),
    staleTime: 60_000,
  });

  /* ---------- derived data ---------- */

  const displayed = useMemo(
    () => projectFilter ? tasks.filter(t => t.project === projectFilter) : tasks,
    [tasks, projectFilter]
  );

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
      // Update selectedTask immediately
      setSelectedTask(cur => cur && cur.id === id ? { ...cur, ...fields } : cur);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tasks'], ctx.prev);
    },
    // Don't invalidate on settle — the optimistic update is authoritative.
    // Only sync from server on explicit refresh or error.
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
      // Optimistic placeholder
      const placeholder: Task = {
        id: -Date.now(),
        title,
        description: '',
        status: 'todo',
        priority: 'medium',
        assignee: '',
        project: projectFilter,
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
      // Replace placeholder with real task
      queryClient.setQueryData<Task[]>(['tasks'], old =>
        (old ?? []).map(t => t.id < 0 ? newTask : t)
      );
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

  const onDragEnd = useCallback((result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const taskId = parseInt(draggableId, 10);
    const newStatus = destination.droppableId;
    const allTasks = queryClient.getQueryData<Task[]>(['tasks']) ?? [];

    // Destination column tasks (excluding the dragged card)
    const destColTasks = allTasks
      .filter(t => t.status === newStatus && t.id !== taskId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    let newPosition = computeNewPosition(destColTasks, destination.index);

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

    // Fire API (background, rollback on failure)
    const fieldsToUpdate: Partial<Task> = { position: newPosition };
    if (newStatus !== source.droppableId) fieldsToUpdate.status = newStatus;

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

      <DragDropContext onDragEnd={onDragEnd}>
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
            />
          ))}
        </div>
      </DragDropContext>

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
