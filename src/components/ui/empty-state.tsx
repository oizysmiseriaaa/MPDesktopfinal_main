'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * EmptyState: friendly placeholder for empty collections/tables.
 * Replaces one-off "No items" blocks across pages for visual consistency.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[24px] bg-secondary px-6 py-12 text-center ring-1 ring-border',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background text-muted-foreground shadow-sm ring-1 ring-border">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
