"use client";

import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { toast } from "@/hooks/use-toast";

export function AppUpdater() {
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdates() {
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
        console.error("Update check failed:", error);
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
