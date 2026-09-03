"use client";

import { Toaster } from "@/components/ui/toaster";
import { FirebaseClientProvider } from "@/firebase/client-provider";
import { AuthGuard } from "@/components/auth-guard";
import { AppUpdater } from "@/components/app-updater";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseClientProvider>
      <AuthGuard>{children}</AuthGuard>
      <AppUpdater />
      <Toaster />
    </FirebaseClientProvider>
  );
}
