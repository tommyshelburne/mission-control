'use client';

interface SpinnerProps {
  size?: number;
  color?: string;
}

export function Spinner({ size = 16, color = 'var(--accent)' }: SpinnerProps) {
  return (
    <span
      className="inline-block rounded-full border-2 border-transparent"
      style={{
        width: size,
        height: size,
        borderTopColor: color,
        animation: 'spin 0.6s linear infinite',
      }}
    />
  );
}
