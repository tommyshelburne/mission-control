'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Activity, Sun, LayoutGrid, TrendingUp, FolderOpen, Brain, Users,
  Briefcase, FileText, DollarSign, Zap, Sparkles, LucideIcon,
} from 'lucide-react';
import { StatusDot } from '@/components/ui';
import { Clock } from './Clock';
import { NotificationBell } from './NotificationBell';

const primaryNav = [
  { label: 'Activity',  href: '/',          icon: Activity },
  { label: 'Digest',    href: '/digest',    icon: Sun },
  { label: 'Tasks',     href: '/tasks',     icon: LayoutGrid },
  { label: 'Pipeline',  href: '/pipeline',  icon: TrendingUp },
  { label: 'Projects',  href: '/projects',  icon: FolderOpen },
  { label: 'Memories',  href: '/memories',  icon: Brain },
  { label: 'Agents',    href: '/team',      icon: Users },
];

const toolsNav = [
  { label: 'Jobs',         href: '/jobs',         icon: Briefcase },
  { label: 'Costs',        href: '/costs',        icon: DollarSign },
  { label: 'Anticipation', href: '/anticipation', icon: Sparkles },
  { label: 'Docs',         href: '/docs',         icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname();

  const NavItem = ({ label, href, icon: Icon }: { label: string; href: string; icon: LucideIcon }) => {
    const active = pathname === href || (href !== '/' && pathname.startsWith(href));
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`sidebar-nav-item flex items-center gap-2 mx-2 px-3 rounded-md relative ${
          active
            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-medium'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
        style={{
          height: 34, fontSize: 13, fontWeight: active ? 500 : 450,
          boxShadow: active ? 'inset 0 0 12px rgba(99,102,241,0.08)' : 'none',
        }}
      >
        {active && (
          <span
            className="absolute left-0 top-0 w-[2px] bg-[var(--accent)]"
            style={{ height: '100%', borderRadius: '0 2px 2px 0' }}
          />
        )}
        <Icon size={15} strokeWidth={active ? 2 : 1.5} className={active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <aside className="w-[208px] flex-shrink-0 bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col h-full">
      {/* Logo */}
      <div className="h-[52px] flex items-center gap-2.5 px-4 border-b border-[var(--border)]">
        <Link href="/" className="flex items-center gap-2.5 flex-1 min-w-0" aria-label="Mission Control home">
          <div
            className="flex items-center justify-center rounded-sm flex-shrink-0"
            style={{ width: 26, height: 26, background: 'linear-gradient(135deg, var(--accent), #8b5cf6)' }}
          >
            <Zap size={14} className="text-white" />
          </div>
          <span className="text-13 text-[var(--text-primary)] truncate" style={{ fontWeight: 600, letterSpacing: '-0.01em' }}>Mission Control</span>
          <span
            className="text-10 flex-shrink-0"
            style={{
              padding: '1px 5px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
            }}
          >
            v4
          </span>
        </Link>
        <NotificationBell />
      </div>

      {/* Primary Nav */}
      <nav className="flex-1 py-2 flex flex-col gap-0.5">
        {primaryNav.map(item => (
          <NavItem key={item.href} {...item} />
        ))}

        <div className="mt-4 mb-1.5 px-4">
          <span className="text-10 uppercase text-[var(--text-muted)] font-medium" style={{ letterSpacing: '0.08em' }}>Tools</span>
        </div>
        {toolsNav.map(item => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Footer */}
      <div className="h-[52px] flex items-center justify-between px-3 border-t border-[var(--border)]">
        <div className="flex items-center gap-2">
          <StatusDot status="active" />
          <span className="text-11 text-[var(--text-muted)]">Claw</span>
        </div>
        <Clock />
      </div>
    </aside>
  );
}
