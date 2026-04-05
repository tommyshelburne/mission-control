'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';

interface InlineEditProps {
  value: string;
  onSave: (val: string) => void;
  multiline?: boolean;
  placeholder?: string;
  textSize?: string;
  textWeight?: string;
}

export function InlineEdit({ value, onSave, multiline, placeholder = 'Click to edit...', textSize = 'text-13', textWeight = 'font-normal' }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { cancel(); return; }
    if (e.key === 'Enter' && !multiline) { save(); return; }
  };

  if (!editing) {
    return (
      <div
        className={`inline-edit-view cursor-pointer ${textSize} ${textWeight} ${value ? 'text-[var(--text-primary)]' : 'text-[var(--text-placeholder)]'} hover:text-[var(--text-primary)] transition-colors duration-[80ms]`}
        onClick={() => setEditing(true)}
      >
        {value || placeholder}
      </div>
    );
  }

  const inputClass = `w-full bg-transparent ${textSize} ${textWeight} text-[var(--text-primary)] border-b border-[var(--border-mid)] focus:border-[var(--accent)] outline-none pb-1 transition-colors duration-[120ms]`;

  if (multiline) {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={handleKey}
        className={`${inputClass} min-h-[80px] resize-y`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={handleKey}
      className={inputClass}
      placeholder={placeholder}
    />
  );
}
