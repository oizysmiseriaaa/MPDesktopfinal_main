"use client";

import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0f172a",
        padding: "2rem",
        textAlign: "center",
        margin: 0,
        fontFamily: "Outfit, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          padding: "2rem",
          backgroundColor: "#111827",
          borderRadius: "1rem",
          boxShadow: "0 4px 24px rgba(0,0,0,0.24)",
          maxWidth: "480px",
          width: "100%",
          color: "#f8fafc",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            backgroundColor: "rgba(245, 158, 11, 0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1rem",
          }}
        >
          <AlertTriangle className="h-6 w-6 text-amber-400" />
        </div>
        <h2
          style={{
            margin: "0 0 0.5rem",
            color: "#f8fafc",
            fontSize: "1.25rem",
          }}
        >
          Something went wrong
        </h2>
        <p
          style={{
            color: "#cbd5e1",
            fontSize: "0.875rem",
            margin: "0 0 1.5rem",
            lineHeight: 1.5,
          }}
        >
          {error?.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          style={{
            padding: "0.625rem 1.5rem",
            backgroundColor: "#f59e0b",
            color: "#fff",
            border: "none",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
