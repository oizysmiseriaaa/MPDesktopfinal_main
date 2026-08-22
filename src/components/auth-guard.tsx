"use client";

import React, { useEffect, useMemo } from "react";
import { useUser } from "@/firebase";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/header";
import { SidebarNav } from "@/components/sidebar-nav";
import { AppShellPreloader } from "@/components/app-shell-preloader";
import { useUserRole } from "@/hooks/use-user-role";
import { canAccessPath } from "@/auth/roles";

/**
 * @fileOverview Protects routes and handles the initial loading state for the desktop app.
 * Optimized for Tauri/Static Export with robust path normalization for trailingSlash: true.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { role, isRoleLoading } = useUserRole();
  const pathname = usePathname();
  const router = useRouter();

  const isPublicPage = useMemo(() => {
    if (!pathname) return false;
    const normalized = pathname.endsWith("/") ? pathname : `${pathname}/`;
    return (
      normalized === "/login/" ||
      normalized === "/register/" ||
      normalized === "/forgot-password/"
    );
  }, [pathname]);

  useEffect(() => {
    if (!isUserLoading && !user && !isPublicPage) {
      router.push("/login/");
    }
    if (
      !isUserLoading &&
      !isRoleLoading &&
      user &&
      !isPublicPage &&
      !canAccessPath(role, pathname || "/")
    ) {
      router.replace("/");
    }
  }, [
    user,
    isUserLoading,
    isRoleLoading,
    isPublicPage,
    pathname,
    role,
    router,
  ]);

  if (isUserLoading || (!isPublicPage && user && isRoleLoading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 rounded-[28px] border border-border bg-card px-8 py-10 shadow-card">
          <Loader2 className="h-12 w-12 animate-spin text-amber-500" />
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-muted-foreground">
            Initialising HostFlow...
          </p>
        </div>
      </div>
    );
  }

  if (isPublicPage) {
    return <>{children}</>;
  }

  if (!user) {
    return null;
  }

  if (!canAccessPath(role, pathname || "/")) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SidebarNav />
        <AppShellPreloader />
        <main className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_20%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--secondary))_100%)] p-4 md:p-6">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
