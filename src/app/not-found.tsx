import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[hsl(var(--accent))]">
          404
        </p>
        <h1 className="text-3xl font-bold text-[hsl(var(--text-primary))]">
          Page not found
        </h1>
        <p className="max-w-md text-sm text-[hsl(var(--text-secondary))]">
          The page you requested could not be found. Return to the dashboard to
          continue working.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[hsl(var(--bg-surface))] px-4 py-2 text-sm font-semibold text-[hsl(var(--text-primary))] shadow-sm transition hover:opacity-90"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>
    </div>
  );
}
