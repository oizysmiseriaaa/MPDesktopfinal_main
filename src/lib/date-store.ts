
'use client';

import { create } from 'zustand';

interface DateState {
  month: number;
  year: number;
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
}

export const useDateStore = create<DateState>((set) => ({
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  setMonth: (month) => set({ month }),
  setYear: (year) => set({ year }),
}));
