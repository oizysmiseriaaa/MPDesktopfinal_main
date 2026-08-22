'use client';

import * as React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

type TrendDirection = 'up' | 'down' | 'neutral';

interface StatCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  iconClassName?: string;
  hint?: string;
  trend?: { value: string; direction?: TrendDirection };
  loading?: boolean;
  className?: string;
}

/**
 * StatCard: premium KPI tile with soft white surface, icon chip, and optional
 * trend pill. Light-mode first to match the premium dashboard spec.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  hint,
  trend,
  loading,
  className,
}: StatCardProps) {
  const trendDirection = trend?.direction ?? 'neutral';
  const TrendIcon = trendDirection === 'up' ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className={cn(
        'surface hover-elevate group flex flex-col gap-4 rounded-[24px] p-5 transition-all duration-300 ease-premium',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon && (
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-black/5',
              iconClassName ?? 'bg-amber-50 text-amber-600'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
      ) : (
        <div className="flex items-end justify-between gap-3">
          <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
          {trend && (
            <span
              className={cn(
                'mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                trendDirection === 'up' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                trendDirection === 'down' && 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
                trendDirection === 'neutral' && 'bg-secondary text-muted-foreground'
              )}
            >
              {trendDirection !== 'neutral' && <TrendIcon className="h-3 w-3" />}
              {trend.value}
            </span>
          )}
        </div>
      )}

      {hint && <p className="text-[11px] font-medium text-muted-foreground">{hint}</p>}
    </div>
  );
}
