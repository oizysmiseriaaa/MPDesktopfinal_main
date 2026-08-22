"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/firebase";
import { signOut } from "firebase/auth";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Home,
  CreditCard,
  DollarSign,
  Users,
  Handshake,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  Wand2,
  Bell,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SidebarItem } from "@/components/ui/sidebar-item";
import { useUserRole } from "@/hooks/use-user-role";
import { canAccessPath } from "@/auth/roles";

const navItems = [
  // Group 1: Main navigation
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Calendar", href: "/calendar/", icon: CalendarDays },
  { name: "Bookings", href: "/bookings/", icon: ClipboardList },
  { name: "Units", href: "/units/", icon: Home },
  { name: "Payments", href: "/payments/", icon: CreditCard },
  { name: "Expenses", href: "/expenses/", icon: DollarSign },
  { name: "Investors", href: "/investors/", icon: Users },
  { name: "Agents", href: "/agents/", icon: Handshake },
  { name: "Reminders", href: "/reminders/", icon: Bell },
  { name: "AI Assistant", href: "/ai-assistant/", icon: Wand2 },
  { name: "Reports", href: "/analytics/", icon: BarChart3 },
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { role } = useUserRole();
  const [isOpen, setIsOpen] = React.useState(false);
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);

  const normalizedPathname = React.useMemo(() => {
    if (!pathname) return "/";
    return pathname.endsWith("/") ? pathname : `${pathname}/`;
  }, [pathname]);

  React.useEffect(() => {
    setPendingHref(null);
  }, [normalizedPathname]);

  React.useEffect(() => {
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const prefetchAll = () => {
      for (const item of navItems) {
        try {
          router.prefetch(item.href);
        } catch {
          // Ignore prefetch errors in desktop webviews.
        }
      }

      try {
        router.prefetch("/settings/");
      } catch {}
    };

    if (typeof idleWindow.requestIdleCallback === "function") {
      const id = idleWindow.requestIdleCallback(prefetchAll, { timeout: 1000 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }

    const timeout = window.setTimeout(prefetchAll, 250);
    return () => window.clearTimeout(timeout);
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login/");
  };

  const onNavigate = (href: string) => {
    const target = href === "/" ? "/" : href.endsWith("/") ? href : `${href}/`;
    if (target === normalizedPathname) {
      setIsOpen(false);
      return;
    }

    setPendingHref(target);
    setIsOpen(false);

    React.startTransition(() => {
      router.push(target);
    });
  };

  const onPrefetch = (href: string) => {
    const target = href === "/" ? "/" : href.endsWith("/") ? href : `${href}/`;
    try {
      router.prefetch(target);
    } catch {}
  };

  return (
    <>
      <Button
        variant="ghost"
        className="md:hidden fixed top-4 left-4 z-50 h-10 w-10 p-0"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close navigation" : "Open navigation"}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </Button>

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 transform border-r border-border bg-card/90 backdrop-blur-xl transition-all duration-300 ease-out md:static md:h-full md:translate-x-0 md:shrink-0",
          collapsed ? "w-[92px]" : "w-72",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-border px-4 py-4 flex items-center gap-3">
            <Link
              href="/"
              prefetch
              onClick={(e) => {
                e.preventDefault();
                onNavigate("/");
              }}
              className="flex items-center gap-3 rounded-2xl bg-secondary px-3 py-3 ring-1 ring-border transition hover:bg-muted"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background p-1 ring-1 ring-border">
                <img
                  src="/manila-prime-staycation-logo.png"
                  alt="Manila Prime"
                  className="h-full w-full object-contain"
                />
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-amber-600">
                    HostFlow
                  </p>
                  <p className="truncate text-sm font-semibold text-foreground">
                    Manila Prime
                  </p>
                </div>
              )}
            </Link>
          </div>

          <div className="px-3 py-3">
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="hidden w-full items-center justify-end gap-2 rounded-2xl px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground md:flex"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
              {!collapsed && "Collapse"}
            </button>
          </div>

          <nav
            className="flex-1 space-y-1 overflow-y-auto px-3 pb-4"
            aria-label="Primary"
          >
            {navItems
              .filter((item) => canAccessPath(role, item.href))
              .map((item) => {
                const target =
                  item.href === "/"
                    ? "/"
                    : item.href.endsWith("/")
                      ? item.href
                      : `${item.href}/`;
                const isActive = normalizedPathname === target;
                return (
                  <SidebarItem
                    key={item.name}
                    icon={item.icon}
                    label={item.name}
                    href={target}
                    active={isActive}
                    pending={pendingHref === target}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                    onPrefetch={onPrefetch}
                  />
                );
              })}
          </nav>

          <div className="space-y-2 border-t border-border p-4">
            {canAccessPath(role, "/settings/") && (
              <SidebarItem
                icon={Settings}
                label="Settings"
                href="/settings/"
                active={normalizedPathname === "/settings/"}
                pending={pendingHref === "/settings/"}
                collapsed={collapsed}
                onNavigate={onNavigate}
                onPrefetch={onPrefetch}
              />
            )}
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-5 w-5 text-muted-foreground" />
              {!collapsed && "Logout"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
