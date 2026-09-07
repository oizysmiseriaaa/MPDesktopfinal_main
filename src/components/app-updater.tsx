"use client";

import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { toast } from "@/hooks/use-toast";

export function AppUpdater() {
  const [, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdates() {
      // The updater plugin only exists in the packaged Tauri desktop app.
      // Skipping browser/dev runtimes also prevents a failed update endpoint
      // from becoming a Next.js development error overlay.
      if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        return;
      }

      try {
        setChecking(true);

        const update = await check();

        if (!update || cancelled) {
          return;
        }

        toast({
          title: "Update Available",
          description: `Version ${update.version} is ready to install.`,
          action: (
            <button
              onClick={async () => {
                try {
                  toast({
                    title: "Downloading Update",
                    description: "Please wait while the update is installed.",
                  });

                  await update.downloadAndInstall();
                } catch (error) {
                  console.error("Update installation failed:", error);

                  toast({
                    title: "Update Failed",
                    description:
                      error instanceof Error
                        ? error.message
                        : "Unable to install the update.",
                    variant: "destructive",
                  });
                }
              }}
              className="rounded-md px-3 py-2 text-sm font-medium"
            >
              Update
            </button>
          ),
        });
      } catch (error) {
        // Update checks are optional. A missing release, unavailable network,
        // or invalid updater manifest must not interrupt normal app usage.
        void error;
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    const timer = window.setTimeout(checkForUpdates, 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
