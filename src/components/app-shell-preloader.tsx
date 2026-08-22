'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppResources } from '@/lib/app-data-store';

const PREFETCH_ROUTES = [
  '/',
  '/calendar/',
  '/bookings/',
  '/units/',
  '/payments/',
  '/expenses/',
  '/investors/',
  '/agents/',
  '/reminders/',
  '/analytics/',
  '/ai-assistant/',
  '/settings/',
];

export function AppShellPreloader() {
  const router = useRouter();

  useAppResources(
    ['units', 'bookings', 'expenses', 'booking-payments', 'reminders', 'agents', 'investors'],
    { preloadOnly: true }
  );

  useEffect(() => {
    const run = () => {
      for (const route of PREFETCH_ROUTES) {
        try {
          router.prefetch(route);
        } catch {
          // Ignore prefetch failures in static-desktop environments.
        }
      }
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const id = idleWindow.requestIdleCallback(run, { timeout: 1200 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }

    const timeout = window.setTimeout(run, 250);
    return () => window.clearTimeout(timeout);
  }, [router]);

  return null;
}
