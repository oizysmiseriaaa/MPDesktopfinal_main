'use client';

import { useEffect } from 'react';

/**
 * Custom hook to clean up body scroll-locking and pointer-events lockout
 * caused by Radix UI/Shadcn dialog overlays.
 */
export function useDialogCleanup(isOpen: boolean) {
  useEffect(() => {
    if (isOpen) return;

    const cleanup = () => {
      document.body.style.pointerEvents = '';
      document.body.removeAttribute('data-scroll-locked');
    };

    cleanup();
    const timeoutId = window.setTimeout(cleanup, 0);
    const frameId = window.requestAnimationFrame(cleanup);

    return () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameId);
    };
  }, [isOpen]);
}
