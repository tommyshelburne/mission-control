'use client';

interface DatePickerProps {
  value: string;
  onChange: (val: string) => void;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDateColor(dateStr: string): string {
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

export function DatePicker({ value, onChange }: DatePickerProps) {
  return (
    <label className={`relative inline-flex items-center cursor-pointer text-11 ${getDateColor(value)}`}>
      <span>{formatDate(value)}</span>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
    </label>
  );
}
