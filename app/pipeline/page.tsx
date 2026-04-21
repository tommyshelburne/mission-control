'use client';

import { useState, useMemo, useCallback, useRef, memo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, useDroppable, closestCorners,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Briefcase, ExternalLink, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, SlidePanel, Spinner, EmptyState } from '@/components/ui';

/* ---------- types ---------- */

type Stage = 'applied' | 'screening' | 'interview' | 'offer' | 'closed';

interface Opportunity {
  id: number;
  title: string;
  company: string;
  stage: Stage;
  source: string;
  location: string;
  salary_min: number | null;
  salary_max: number | null;
  url: string;
  contact: string;
  notes: string;
  next_action: string;
  next_action_date: string | null;
  applied_at: string | null;
  closed_reason: string;
  position: number;
  created_at: string;
  updated_at: string;
}

interface Response {
  opportunities: Opportunity[];
  stage_counts: Partial<Record<Stage, number>>;
}

const COLUMNS: { key: Stage; label: string; color: string }[] = [
  { key: 'applied',    label: 'Applied',    color: '#6366f1' },
  { key: 'screening',  label: 'Screening',  color: '#f59e0b' },
  { key: 'interview',  label: 'Interview',  color: '#ec4899' },
  { key: 'offer',      label: 'Offer',      color: '#22c55e' },
  { key: 'closed',     label: 'Closed',     color: '#6b7280' },
];

const CLOSED_REASONS = ['', 'rejected', 'withdrew', 'accepted', 'ghosted', 'declined'] as const;
const SOURCES = ['', 'linkedin', 'referral', 'direct', 'recruiter', 'other'];

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return '';
  const fmt = (n: number) => `$${(n / 1000).toFixed(0)}k`;
  if (min && max) return `${fmt(min)}–${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  if (max) return `up to ${fmt(max)}`;
  return '';
}

function relativeDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = d.getTime() - Date.now();
  const days = Math.round(diff / 86400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 0 && days < 7) return `in ${days}d`;
  if (days < 0 && days > -30) return `${-days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ---------- component ---------- */

export default function PipelinePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Response>({
    queryKey: ['opportunities'],
    queryFn: async () => (await fetch('/api/opportunities')).json(),
    refetchInterval: 60_000,
  });

  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [addingIn, setAddingIn] = useState<Stage | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const addCompanyRef = useRef<HTMLInputElement>(null);

  const grouped = useMemo(() => {
    const g: Record<Stage, Opportunity[]> = { applied: [], screening: [], interview: [], offer: [], closed: [] };
    for (const o of data?.opportunities ?? []) g[o.stage].push(o);
    return g;
  }, [data]);

  const totalCount = data?.opportunities.length ?? 0;

  const patchOpp = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/opportunities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      qc.invalidateQueries({ queryKey: ['activity-home'] });
    },
  });

  const createOpp = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      qc.invalidateQueries({ queryKey: ['activity-home'] });
    },
  });

  const deleteOpp = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/opportunities/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opportunities'] }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as number);
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeOpp = data?.opportunities.find((o) => o.id === active.id);
    if (!activeOpp) return;

    const overId = over.id;
    let targetStage: Stage | null = null;
    // over may be a column key or another opportunity id
    if (typeof overId === 'string' && COLUMNS.some((c) => c.key === overId)) {
      targetStage = overId as Stage;
    } else {
      const targetOpp = data?.opportunities.find((o) => o.id === overId);
      if (targetOpp) targetStage = targetOpp.stage;
    }
    if (targetStage && targetStage !== activeOpp.stage) {
      patchOpp.mutate({ id: activeOpp.id, body: { stage: targetStage } });
    }
  };

  const activeOpp = activeId != null ? data?.opportunities.find((o) => o.id === activeId) : null;

  const handleAddCommit = useCallback(() => {
    const title = addInputRef.current?.value.trim();
    const company = addCompanyRef.current?.value.trim();
    if (!title || !company || !addingIn) {
      setAddingIn(null);
      return;
    }
    createOpp.mutate({ title, company, stage: addingIn });
    setAddingIn(null);
  }, [addingIn, createOpp]);

  return (
    <>
      <PageHeader title="Pipeline" subtitle={isLoading ? undefined : `${totalCount} opportunities`} />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size={20} />
        </div>
      ) : totalCount === 0 && addingIn === null ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <EmptyState icon={<Briefcase size={32} />} title="No opportunities yet" subtitle="Add your first one to start tracking." />
          <Button variant="primary" size="sm" onClick={() => setAddingIn('applied')}>+ New opportunity</Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-row gap-3 p-6 flex-1 overflow-auto items-start">
            {COLUMNS.map((col) => (
              <Column
                key={col.key}
                col={col}
                opps={grouped[col.key]}
                addingHere={addingIn === col.key}
                onStartAdd={() => setAddingIn(col.key)}
                onCancelAdd={() => setAddingIn(null)}
                onCommitAdd={handleAddCommit}
                titleRef={addInputRef}
                companyRef={addCompanyRef}
                onCardClick={setSelected}
              />
            ))}
          </div>
          <DragOverlay>
            {activeOpp ? <Card opp={activeOpp} isDragOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <SlidePanel open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.company} · ${selected.title}` : ''}>
        {selected && (
          <EditPanel
            opp={selected}
            onPatch={(body) => patchOpp.mutate({ id: selected.id, body })}
            onDelete={() => {
              deleteOpp.mutate(selected.id);
              setSelected(null);
            }}
          />
        )}
      </SlidePanel>
    </>
  );
}

/* ---------- Column ---------- */

function Column({
  col, opps, addingHere, onStartAdd, onCancelAdd, onCommitAdd, titleRef, companyRef, onCardClick,
}: {
  col: { key: Stage; label: string; color: string };
  opps: Opportunity[];
  addingHere: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onCommitAdd: () => void;
  titleRef: React.RefObject<HTMLInputElement>;
  companyRef: React.RefObject<HTMLInputElement>;
  onCardClick: (o: Opportunity) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const ids = useMemo(() => opps.map((o) => o.id), [opps]);

  return (
    <div
      className="flex flex-col w-[300px] min-w-[300px] gap-2 rounded-lg"
      style={{
        background: isOver ? 'rgba(99,102,241,0.06)' : 'transparent',
        outline: isOver ? '1.5px solid rgba(99,102,241,0.3)' : '1.5px solid transparent',
        padding: '0 4px 8px',
      }}
    >
      <div className="flex items-center justify-between mb-2 pb-2" style={{ height: 36, borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: col.color }} />
          <span className="text-11 uppercase text-[var(--text-muted)]" style={{ fontWeight: 500, letterSpacing: '0.06em' }}>
            {col.label}
          </span>
          <Badge label={String(opps.length)} variant="neutral" size="xs" />
        </div>
        <Button variant="ghost" size="sm" onClick={onStartAdd}>+ New</Button>
      </div>

      <div ref={setNodeRef} className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
        {addingHere && (
          <div
            className="p-3 rounded-md border border-[var(--accent)]"
            style={{ background: 'var(--bg-card)' }}
          >
            <input
              ref={companyRef}
              placeholder="Company"
              className="w-full bg-transparent text-13 text-[var(--text-primary)] outline-none mb-1"
              style={{ fontWeight: 600 }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onCancelAdd();
                if (e.key === 'Enter') titleRef.current?.focus();
              }}
              autoFocus
            />
            <input
              ref={titleRef}
              placeholder="Role title"
              className="w-full bg-transparent text-12 text-[var(--text-secondary)] outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Escape') onCancelAdd();
                if (e.key === 'Enter') onCommitAdd();
              }}
            />
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--border)]">
              <Button variant="primary" size="sm" onClick={onCommitAdd}>Save</Button>
              <Button variant="ghost" size="sm" onClick={onCancelAdd}>Cancel</Button>
            </div>
          </div>
        )}

        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {opps.map((o) => (
            <SortableCard key={o.id} opp={o} onClick={onCardClick} />
          ))}
        </SortableContext>

        {opps.length === 0 && !addingHere && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
            Empty
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Card ---------- */

const SortableCard = memo(function SortableCard({ opp, onClick }: { opp: Opportunity; onClick: (o: Opportunity) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: opp.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onClick(opp)}
    >
      <Card opp={opp} />
    </div>
  );
});

function Card({ opp, isDragOverlay = false }: { opp: Opportunity; isDragOverlay?: boolean }) {
  const salary = formatSalary(opp.salary_min, opp.salary_max);
  const nextDate = relativeDate(opp.next_action_date);
  const overdue = opp.next_action_date && new Date(opp.next_action_date).getTime() < Date.now();

  return (
    <div
      className="p-3 rounded-md select-none"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.03), transparent)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--glass-border)',
        boxShadow: isDragOverlay ? '0 8px 24px rgba(0,0,0,0.5)' : '0 1px 3px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">
        {opp.company}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }} className="truncate">
        {opp.title}
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap" style={{ fontSize: 10 }}>
        {opp.location && <Badge label={opp.location} variant="muted" size="xs" />}
        {salary && <Badge label={salary} variant="muted" size="xs" />}
        {opp.source && <Badge label={opp.source} variant="neutral" size="xs" />}
      </div>
      {opp.next_action && (
        <div className="flex items-center gap-1.5 mt-2" style={{ fontSize: 11 }}>
          <span style={{ color: overdue ? 'var(--danger)' : 'var(--text-muted)' }}>→</span>
          <span className="truncate" style={{ color: 'var(--text-secondary)', flex: 1 }}>{opp.next_action}</span>
          {nextDate && (
            <span style={{ color: overdue ? 'var(--danger)' : 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>
              {nextDate}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- edit panel ---------- */

function EditPanel({
  opp,
  onPatch,
  onDelete,
}: {
  opp: Opportunity;
  onPatch: (body: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const blurField = (field: keyof Opportunity) => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    if (v !== String(opp[field] ?? '')) onPatch({ [field]: v });
  };

  const setSelect = (field: keyof Opportunity, v: string) => {
    if (v !== String(opp[field] ?? '')) onPatch({ [field]: v });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Company">
          <input defaultValue={opp.company} onBlur={blurField('company')} style={inputStyle} />
        </Field>
        <Field label="Role">
          <input defaultValue={opp.title} onBlur={blurField('title')} style={inputStyle} />
        </Field>
        <Field label="Stage">
          <select value={opp.stage} onChange={(e) => setSelect('stage', e.target.value)} style={inputStyle}>
            {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Source">
          <select value={opp.source} onChange={(e) => setSelect('source', e.target.value)} style={inputStyle}>
            {SOURCES.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
          </select>
        </Field>
        <Field label="Location">
          <input defaultValue={opp.location} onBlur={blurField('location')} style={inputStyle} />
        </Field>
        <Field label="Contact">
          <input defaultValue={opp.contact} onBlur={blurField('contact')} style={inputStyle} />
        </Field>
        <Field label="Salary min ($)">
          <input
            type="number"
            defaultValue={opp.salary_min ?? ''}
            onBlur={(e) => {
              const v = e.target.value ? parseInt(e.target.value, 10) : null;
              if (v !== opp.salary_min) onPatch({ salary_min: v });
            }}
            style={inputStyle}
          />
        </Field>
        <Field label="Salary max ($)">
          <input
            type="number"
            defaultValue={opp.salary_max ?? ''}
            onBlur={(e) => {
              const v = e.target.value ? parseInt(e.target.value, 10) : null;
              if (v !== opp.salary_max) onPatch({ salary_max: v });
            }}
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Posting URL">
        <div className="flex items-center gap-2">
          <input defaultValue={opp.url} onBlur={blurField('url')} style={{ ...inputStyle, flex: 1 }} />
          {opp.url && (
            <a href={opp.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </Field>

      <Field label="Next action">
        <input defaultValue={opp.next_action} onBlur={blurField('next_action')} style={inputStyle} placeholder="e.g. Follow up with recruiter" />
      </Field>
      <Field label="Next action date (ISO)">
        <input
          type="date"
          defaultValue={opp.next_action_date ? opp.next_action_date.slice(0, 10) : ''}
          onBlur={(e) => {
            const v = e.target.value || null;
            if (v !== opp.next_action_date) onPatch({ next_action_date: v });
          }}
          style={inputStyle}
        />
      </Field>

      {opp.stage === 'closed' && (
        <Field label="Closed reason">
          <select value={opp.closed_reason} onChange={(e) => setSelect('closed_reason', e.target.value)} style={inputStyle}>
            {CLOSED_REASONS.map((r) => <option key={r} value={r}>{r || '—'}</option>)}
          </select>
        </Field>
      )}

      <Field label="Notes">
        <textarea
          defaultValue={opp.notes}
          onBlur={blurField('notes')}
          rows={6}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 12 }}
        />
      </Field>

      <div className="pt-3 border-t border-[var(--border)] flex items-center gap-2">
        {!confirmDel ? (
          <button
            onClick={() => setConfirmDel(true)}
            className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--danger)]"
            style={{ fontSize: 12, background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <Trash2 size={12} /> Delete opportunity
          </button>
        ) : (
          <>
            <span style={{ fontSize: 12, color: 'var(--danger)' }}>Confirm?</span>
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5"
              style={{ fontSize: 12, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--danger)', borderRadius: 'var(--radius-xs)', padding: '3px 8px', cursor: 'pointer' }}
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              style={{ fontSize: 12, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontSize: 13,
  padding: '6px 10px',
  outline: 'none',
};
