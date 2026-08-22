'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useAuth, useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useAppResources } from '@/lib/app-data-store';
import {
  Bell,
  ChevronDown,
  UserRound,
  ShieldCheck,
  LogOut,
  Mail,
  Phone,
  CalendarClock,
  Clock,
  Building2,
  ShieldAlert,
  Fingerprint,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Firebase's published `User` type (as resolved by this repo's dependency
 * tree) does not always surface `photoURL`/`metadata`. They exist at runtime,
 * so we read them through a small typed view.
 */
type AuthUserExtra = {
  photoURL?: string | null;
  metadata?: { creationTime?: string | null; lastSignInTime?: string | null };
};

/**
 * AvatarDropdown: top-navbar profile control.
 * - Real-time notification count derived from the reminders collection.
 * - Avatar + dropdown with View Profile / Account Settings / Logout.
 * - View Profile dialog populated entirely from the authenticated user + user doc.
 */
export function AvatarDropdown() {
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();
  const { user } = useUser();

  const { data: reminders } = useAppResources(['reminders']);
  const activeReminders = React.useMemo(
    () => (reminders['reminders'] ?? []).filter((r: any) => r.status !== 'completed' && r.status !== 'done').length,
    [reminders]
  );

  const userRef = React.useMemo(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user?.uid]
  );
  const { data: profile } = useDoc(userRef);

  const authUser = user as unknown as (AuthUserExtra | null);

  const [isProfileOpen, setIsProfileOpen] = React.useState(false);

  const displayName = profile?.displayName || user?.displayName || 'HostFlow Admin';
  const email = profile?.email || user?.email || '—';
  const initials = (displayName || 'HP')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase() || '')
    .join('') || 'HP';
  const phone = profile?.phone || user?.phoneNumber || 'Not provided';
  const role = profile?.role || 'viewer';
  const photoURL = authUser?.photoURL || profile?.photoURL || null;

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login/');
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Notification bell — count derived from real reminders collection */}
        <button
          type="button"
          onClick={() => router.push('/reminders/')}
          className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground ring-1 ring-border transition hover:bg-muted"
          aria-label={`Notifications (${activeReminders} active)`}
        >
          <Bell className="h-4 w-4" />
          {activeReminders > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-slate-950">
              {activeReminders > 99 ? '99+' : activeReminders}
            </span>
          )}
        </button>

        {/* Avatar + dropdown */}
        <div className="flex items-center gap-2 rounded-2xl bg-secondary px-1.5 py-1 ring-1 ring-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-2xl px-1 py-0.5 outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-amber-500/60"
                aria-label="Account menu"
              >
                <Avatar className="h-9 w-9 ring-2 ring-white">
                  {photoURL ? <AvatarImage src={photoURL} alt={displayName} /> : null}
                  <AvatarFallback className="bg-amber-500 text-sm font-semibold text-slate-950">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 animate-slide-down rounded-[24px] border-border bg-popover p-1.5 text-popover-foreground">
              <DropdownMenuLabel className="px-2 py-1.5">
                <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* Defer opening until the dropdown's focus restoration finishes to avoid
                  a focus-trap deadlock that can freeze the panel in the Tauri webview. */}
              <DropdownMenuItem
                onSelect={() => {
                  requestAnimationFrame(() => setIsProfileOpen(true));
                }}
                className="cursor-pointer rounded-xl px-2.5 py-2 text-sm"
              >
                <UserRound className="mr-2 h-4 w-4 text-muted-foreground" />
                View Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => router.push('/settings/')}
                className="cursor-pointer rounded-xl px-2.5 py-2 text-sm"
              >
                <ShieldCheck className="mr-2 h-4 w-4 text-muted-foreground" />
                Account Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleLogout}
                className="cursor-pointer rounded-xl px-2.5 py-2 text-sm text-rose-600 focus:bg-rose-50 focus:text-rose-600"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* View Profile dialog — fully populated from real auth + user doc */}
      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent className="sm:max-w-[540px] rounded-[28px] border-border bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <Avatar className="h-12 w-12 ring-2 ring-amber-200">
                {photoURL ? <AvatarImage src={photoURL} alt={displayName} /> : null}
                <AvatarFallback className="bg-amber-500 text-base font-semibold text-slate-950">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <span className="block truncate">{displayName}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">{role}</span>
              </div>
            </DialogTitle>
            <DialogDescription>
              Live account details from your authentication session and user record.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-1">
            <ProfileField icon={Mail} label="Email" value={email} />
            <ProfileField icon={Phone} label="Phone" value={phone} />
            <ProfileField icon={ShieldAlert} label="Role" value={role} />
            {profile?.companyName && (
              <ProfileField icon={Building2} label="Company" value={profile.companyName} />
            )}
            <ProfileField
              icon={CalendarClock}
              label="Account Created"
              value={formatDateTime(authUser?.metadata?.creationTime)}
            />
            <ProfileField
              icon={Clock}
              label="Last Login"
              value={formatDateTime(authUser?.metadata?.lastSignInTime)}
            />
            <ProfileField
              icon={ShieldCheck}
              label="Email Verified"
              value={user?.emailVerified ? 'Yes' : 'No'}
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" className="rounded-2xl" onClick={() => setIsProfileOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProfileField({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-secondary p-3 ring-1 ring-border">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-amber-600 ring-1 ring-border">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-muted-foreground">{label}</p>
        <p className={cn('mt-0.5 truncate text-sm text-foreground', mono && 'font-mono text-xs')}>
          {value}
        </p>
      </div>
    </div>
  );
}
