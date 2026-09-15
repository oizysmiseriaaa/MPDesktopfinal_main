export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;

  const tauriWindow = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };

  return Boolean(
    tauriWindow.__TAURI_INTERNALS__ ||
    tauriWindow.__TAURI__ ||
    (typeof navigator !== "undefined" && /Tauri/i.test(navigator.userAgent)),
  );
}

export async function loadTauriFs() {
  if (!isTauriRuntime()) {
    throw new Error("This feature is only available in the desktop app.");
  }

  return import("@tauri-apps/plugin-fs");
}
