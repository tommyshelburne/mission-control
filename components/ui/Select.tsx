'use client';

import { ChevronDown } from 'lucide-react';

interface SelectProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
  placeholder?: string;
  'aria-label'?: string;
}

export function Select({ value, options, onChange, placeholder = 'Select...', 'aria-label': ariaLabel }: SelectProps) {
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="appearance-none bg-transparent text-12 text-[var(--text-primary)] border-b border-[var(--border-mid)] focus:border-[var(--accent)] outline-none pr-5 pb-0.5 cursor-pointer transition-colors duration-[120ms]"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value} className="bg-[var(--bg-elevated)] text-[var(--text-primary)]">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
    </div>
  );
}
