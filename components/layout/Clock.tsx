'use client';

import { useEffect, useState } from 'react';

export function Clock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className="text-11 text-[var(--text-muted)]"
      style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}
    >
      {time}
    </span>
  );
}
