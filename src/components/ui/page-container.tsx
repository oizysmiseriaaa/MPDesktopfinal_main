'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * PageContainer: standardized max-width shell with premium vertical rhythm.
 * Wraps every authenticated page so spacing/proportions stay consistent.
 */
export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('mx-auto max-w-[1600px] animate-card-enter space-y-6 pb-10', className)}>
      {children}
    </div>
  );
}
