'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * LoadingSkeleton: shimmer placeholder used while real data loads.
 * Memoized so it never re-renders during parent updates.
 */
export const LoadingSkeleton = React.memo(function LoadingSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-slate-200/70', className)}
      aria-hidden
    />
  );
});

/**
 * SkeletonCard: a card-shaped skeleton for list/grid loading states.
 */
export const SkeletonCard = React.memo(function SkeletonCard({
  className,
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div className={cn('surface flex flex-col gap-3 p-5', className)}>
      <LoadingSkeleton className="h-10 w-10 rounded-xl" />
      <LoadingSkeleton className="h-4 w-2/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <LoadingSkeleton key={i} className="h-3 w-full" />
      ))}
    </div>
  );
});

/**
 * SkeletonTable: row skeleton for tables while loading.
 */
export const SkeletonRows = React.memo(function SkeletonRows({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <LoadingSkeleton key={i} className="h-12 w-full rounded-2xl" />
      ))}
    </div>
  );
});
