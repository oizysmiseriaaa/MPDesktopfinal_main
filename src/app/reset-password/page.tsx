"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * DEPRECATED: This page is no longer used.
 *
 * Password resets are now handled entirely by Firebase's built-in flow.
 * Users receive a password reset email and complete the reset through
 * Firebase's hosted password reset interface.
 *
 * This page redirects to login for backward compatibility.
 */
export default function ResetPasswordPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to login since password reset is now handled by Firebase
    router.push("/login/");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 rounded-[28px] border border-border bg-card px-8 py-10 shadow-card">
        <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Redirecting to Sign In
        </p>
      </div>
    </div>
  );
}
