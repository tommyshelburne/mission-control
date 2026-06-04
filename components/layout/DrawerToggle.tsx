'use client';

import { Menu } from 'lucide-react';
import { useDrawer } from './DrawerContext';

/** Hamburger that opens the nav drawer. Mobile-only; hidden at md+ where the
 *  sidebar is always visible. Lives in PageHeader so every page gets it. */
export function DrawerToggle() {
  const { setOpen } = useDrawer();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open navigation"
      className="md:hidden -ml-1 p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
    >
      <Menu size={20} />
    </button>
  );
}
