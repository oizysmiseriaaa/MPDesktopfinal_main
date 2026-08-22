'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  active: boolean;
  pending?: boolean;
  collapsed?: boolean;
  onNavigate: (href: string) => void;
  onPrefetch?: (href: string) => void;
  variant?: 'nav' | 'action';
}

/**
 * SidebarItem: single navigation/action row for the sidebar.
 * Shared active-indicator, hover, and pending-spinner behavior.
 */
export function SidebarItem({
  icon: Icon,
  label,
  href,
  active,
  pending,
  collapsed,
  onNavigate,
  onPrefetch,
  variant = 'nav',
}: SidebarItemProps) {
  const isAction = variant === 'action';

  return (
    <button
      type="button"
      onClick={() => onNavigate(href)}
      onMouseEnter={() => onPrefetch?.(href)}
      aria-current={active ? 'page' : undefined}
      title={label}
      className={cn(
        'group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ease-premium text-left',
        isAction
          ? active
            ? 'bg-amber-500 text-slate-950'
            : 'text-slate-600 hover:bg-slate-100 hover:text-amber-700'
          : active
            ? 'bg-amber-500 text-slate-950 shadow-[0_10px_30px_-14px_rgba(245,158,11,0.95)]'
            : 'text-slate-600 hover:bg-slate-100 hover:text-amber-700'
      )}
    >
      {pending ? (
        <Loader2
          className={cn('h-5 w-5 shrink-0 animate-spin', active ? 'text-slate-950' : 'text-amber-600')}
        />
      ) : (
        <Icon
          className={cn(
            'h-5 w-5 shrink-0 transition-colors',
            active ? 'text-slate-950' : 'text-slate-500 group-hover:text-amber-700'
          )}
        />
      )}
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}
