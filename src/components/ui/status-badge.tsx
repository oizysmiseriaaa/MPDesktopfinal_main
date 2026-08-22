'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const statusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors',
  {
    variants: {
      tone: {
        neutral: 'bg-slate-100 text-slate-600',
        success: 'bg-emerald-50 text-emerald-700',
        warning: 'bg-amber-50 text-amber-700',
        danger: 'bg-rose-50 text-rose-700',
        info: 'bg-sky-50 text-sky-700',
        brand: 'bg-amber-50 text-amber-700',
        violet: 'bg-violet-50 text-violet-700',
      },
      dot: {
        true: '',
        false: 'gap-1.5',
      },
    },
    defaultVariants: {
      tone: 'neutral',
      dot: false,
    },
  }
);

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  /** Optional leading status dot color (any tailwind bg-* class). */
  dotClassName?: string;
  label?: string;
}

const dotTone: Record<NonNullable<VariantProps<typeof statusBadgeVariants>['tone']>, string> = {
  neutral: 'bg-slate-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
  brand: 'bg-amber-500',
  violet: 'bg-violet-500',
};

/**
 * StatusBadge: consistent status pill with optional leading dot.
 * Maps booking/payment/reminder statuses to a semantic tone.
 */
export function StatusBadge({
  className,
  tone,
  dot,
  dotClassName,
  label,
  children,
  ...props
}: StatusBadgeProps) {
  const resolvedTone = tone ?? 'neutral';
  return (
    <span className={cn(statusBadgeVariants({ tone, dot }), className)} {...props}>
      {dot !== false && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            dotClassName ?? dotTone[resolvedTone]
          )}
          aria-hidden
        />
      )}
      {label ?? children}
    </span>
  );
}

/**
 * statusTone: helper to translate a raw status string into a semantic tone.
 */
export function statusTone(status?: string): VariantProps<typeof statusBadgeVariants>['tone'] {
  switch ((status || '').toLowerCase()) {
    case 'paid':
    case 'available':
    case 'active':
    case 'completed':
    case 'confirmed':
    case 'success':
      return 'success';
    case 'received':
      return 'warning';
    case 'partial':
    case 'pending':
    case 'medium':
      return 'info';
    case 'refunded':
      return 'neutral';
    case 'unpaid':
    case 'blocked':
      return 'danger';
    case 'overdue':
    case 'failed':
    case 'cancelled':
    case 'high':
    case 'rejected':
    case 'booked':
      return 'danger';
    case 'low':
      return 'info';
    default:
      return 'neutral';
  }
}
