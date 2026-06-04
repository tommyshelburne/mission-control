'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { DrawerContext } from './DrawerContext';
import { useEventStream } from '@/lib/hooks';

/**
 * Responsive app shell (triage F5). Below `md` the 208px sidebar becomes an
 * off-canvas drawer toggled by the hamburger in PageHeader (see DrawerToggle);
 * at `md`+ it is a static column exactly as before. The old layout rendered the
 * fixed-width sidebar at every viewport, so on a phone it ate half the screen
 * and pushed content off the right edge.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Live updates over SSE for the whole app (replaces aggressive polling).
  useEventStream();

  // Close the drawer on navigation by adjusting state during render (React's
  // endorsed pattern for resetting state when a derived value changes) — avoids
  // an effect and the extra paint it would cause.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  return (
    <DrawerContext.Provider value={{ open, setOpen }}>
      <div className="flex h-screen overflow-hidden">
        {/* Backdrop — mobile only, click to dismiss */}
        <div
          className={`fixed inset-0 z-30 bg-black/60 transition-opacity duration-200 md:hidden ${
            open ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />

        {/* Sidebar: off-canvas drawer < md, static column md+ */}
        <div
          className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0 ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col overflow-hidden min-w-0">{children}</main>
      </div>
    </DrawerContext.Provider>
  );
}
