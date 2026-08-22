'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import { MoonStar, SunMedium } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDateStore } from '@/lib/date-store';
import { Button } from '@/components/ui/button';
import { AvatarDropdown } from '@/components/ui/avatar-dropdown';
import { useDoc } from '@/firebase';

export function Header() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { month, year, setMonth, setYear } = useDateStore();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const settingsRef = React.useMemo(
    () => (user ? doc(firestore, 'users', user.uid, 'settings', 'config') : null),
    [firestore, user?.uid]
  );
  const { data: settings } = useDoc(settingsRef);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('hostflow-theme');
    const nextTheme = savedTheme === 'light' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem('hostflow-theme', theme);
  }, [theme]);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = Array.from({ length: 7 }, (_, i) => 2024 + i);

  return (
    <header className="relative z-20 shrink-0 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="min-w-0">
          <p className="eyebrow">Operations Console</p>
          <h1 className="truncate text-lg font-semibold text-foreground md:text-2xl">
            {settings?.systemTitle || 'Manila Prime Property Management'}
          </h1>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground ring-1 ring-border transition hover:bg-muted"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            aria-label="Toggle dark mode"
          >
            {theme === 'dark' ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
          </button>

          <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
            <SelectTrigger className="h-10 w-[140px] rounded-2xl border-border bg-secondary text-foreground">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              {months.map((m, i) => (
                <SelectItem key={m} value={i.toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="h-10 w-[100px] rounded-2xl border-border bg-secondary text-foreground">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AvatarDropdown />
        </div>
      </div>
    </header>
  );
}
