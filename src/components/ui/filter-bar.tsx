'use client';

import * as React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * FilterBar: wraps filter controls (selects, toggles, search) in a consistent
 * toolbar row with premium spacing and a subtle surface.
 */
export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-[24px] border border-border bg-card/80 p-3 shadow-card backdrop-blur',
        className
      )}
    >
      <span className="hidden items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
      </span>
      {children}
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  className?: string;
}

/**
 * FilterSelect: labelled native-like select used inside FilterBar.
 * Uses the existing shadcn Select under the hood for consistency.
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: FilterSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn('h-10 w-auto min-w-[140px] rounded-2xl border-border bg-background text-sm text-foreground', className)}
        aria-label={label}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent className="rounded-2xl">
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
