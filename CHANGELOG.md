# Changelog

## 0.2.0 — 2026-05-14

### Fixed
- Tasks page top bar no longer crops card highlight/hover shadows (PageHeader z-10 + drop shadow).
- Project dropdown on Tasks now reflects newly created projects immediately (Projects page migrated to react-query; mutations invalidate `['projects']`).
- Assignee dropdown is populated from `/api/agents` (live fleet, 30s refetch); previously hardcoded list missed hermes / sage / pulse / ledger.
- Activity (home) page scrolls again (`flex-1 overflow-y-auto min-h-0` on content wrapper).
- Tommy's UI actions show up in the Activity feed — tasks/projects POST/PATCH/DELETE now write `activity_log` via `lib/activity.logActivity`.
- Drag/drop snap-back and lag eliminated: client now POSTs `{taskId, targetStatus, targetIndex}` to new `/api/tasks/reorder`; the server does all position math + rebalance in one SQLite transaction and returns the full task list.
- Mutation errors surface as toast notifications (sonner) instead of `.catch(() => {})`.
- Docs page opens in rich-preview by default (still per-file persistable).
- Docs Category/Date toggle and Archive bulk button height/icons normalized.

### Added
- Task sort selector in the Tasks header: manual / priority / due / recently updated / newest. Persisted to localStorage.
- Done column always sorts by `completed_at DESC` regardless of selector.
- `completed_at` is set on transitions into `done` (cleared on transitions out).
- One-shot backfill migration `007_completed_at_backfill.sql` populates `completed_at` for already-done tasks (= `updated_at`).
- `lib/toast.ts` wrapper and `fetchJson` helper (throws on non-2xx so toasts fire on HTTP errors, not just network ones).
- `lib/activity.ts` server-side activity log helper.
- New endpoint `POST /api/tasks/reorder` (single-transaction reorder).
