'use client';

import { Loader2 } from 'lucide-react';

export function PageTransitionFallback({ label = 'Loading page...' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-2xl border bg-white/90 shadow-sm">
      <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
