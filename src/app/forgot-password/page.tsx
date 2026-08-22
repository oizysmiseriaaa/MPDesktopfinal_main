"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendPasswordResetEmail } from "firebase/auth";
import { useAuth, useUser } from "@/firebase";
import { getFriendlyAuthErrorMessage } from "@/firebase/auth-error-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !isUserLoading) {
      router.push("/");
    }
  }, [user, isUserLoading, router]);

  const submitResetRequest = async () => {
    if (loading) return;
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Use Firebase's built-in password reset email flow
      // Firebase handles the reset link and password change process
      await sendPasswordResetEmail(auth, trimmedEmail);
      setIsSubmitted(true);
    } catch (caughtError) {
      setError(getFriendlyAuthErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitResetRequest();
  };

  const handleResendEmail = async () => {
    await submitResetRequest();
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.15),_transparent_28%),linear-gradient(to_bottom,_#f8fafc,_#f2f4f7)] px-4 py-10 text-[hsl(var(--text-primary))]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-[980px] items-center justify-center">
        <div className="w-full max-w-[900px] space-y-8">
          <header className="text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] bg-white p-2 shadow-[0_20px_55px_-28px_rgba(245,158,11,0.85)] ring-1 ring-amber-100">
              <img
                src="/manila-prime-staycation-logo.png"
                alt="Manila Prime Staycation logo"
                className="h-full w-full object-contain"
              />
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-[hsl(var(--text-primary))] md:text-5xl">
              Manila Prime Staycation
            </h1>
            <p className="mt-2 text-sm text-[hsl(var(--text-secondary))] md:text-base">
              Property Operations
            </p>
          </header>

          <div className="mx-auto w-full max-w-[900px] rounded-[30px] border border-[var(--border)] bg-white p-1 shadow-[0_28px_90px_-40px_rgba(15,23,42,0.55)]">
            <div className="rounded-[28px] bg-white p-6 md:p-8">
              {isSubmitted ? (
                <div className="flex flex-col items-center px-2 py-6 text-center">
                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h2 className="text-2xl font-semibold text-[hsl(var(--text-primary))]">
                    Check your email
                  </h2>
                  <p className="mt-3 max-w-[560px] text-sm leading-6 text-[hsl(var(--text-secondary))]">
                    We&apos;ve sent a password reset link to your email address.
                    Please check your inbox and follow the instructions to reset
                    your password.
                  </p>
                  <div className="mt-6 flex w-full max-w-[420px] flex-col gap-3 sm:flex-row">
                    <Button
                      asChild
                      className="h-12 flex-1 rounded-2xl bg-[hsl(var(--accent))] text-base font-semibold text-[hsl(var(--accent-foreground))] shadow-[0_18px_45px_-24px_rgba(245,158,11,0.85)] transition-all duration-200 hover:bg-[hsl(var(--accent-hover))] hover:shadow-[0_24px_55px_-24px_rgba(245,158,11,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))] focus-visible:ring-offset-2 active:scale-[0.99]"
                    >
                      <Link href="/login/">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Sign In
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 flex-1 rounded-2xl border-[var(--border)] text-base font-semibold text-[hsl(var(--text-primary))] transition-all duration-200 hover:border-amber-400 hover:bg-[hsl(var(--accent))]/10 hover:text-[hsl(var(--accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))] focus-visible:ring-offset-2 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-100"
                      onClick={handleResendEmail}
                      disabled={loading}
                      aria-busy={loading}
                    >
                      {loading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Resend Email
                    </Button>
                  </div>

                  <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                    If you still cannot access your account, contact your Manila
                    Prime administrator or the person who set up your account
                    for a manual reset.
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="flex items-start gap-3 rounded-[20px] border border-amber-200/70 bg-amber-50/70 px-4 py-3 dark:border-amber-400/20 dark:bg-amber-500/10">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] shadow-sm">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-[1.35rem] font-semibold text-[hsl(var(--text-primary))]">
                        Forgot your password?
                      </h2>
                      <p className="mt-1 text-sm text-[hsl(var(--text-secondary))]">
                        Enter your email address and we&apos;ll send you a
                        password reset link.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="email"
                      className="text-sm font-semibold text-[hsl(var(--text-primary))]"
                    >
                      Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-secondary))]" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="h-12 rounded-2xl border-[var(--border)] bg-[hsl(var(--bg-primary))] pl-10 text-[hsl(var(--text-primary))] focus:border-[hsl(var(--accent))] focus-visible:ring-2 focus-visible:ring-amber-500/30"
                      />
                    </div>
                  </div>

                  {error ? (
                    <div
                      aria-live="polite"
                      className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  ) : null}

                  <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      Please check your spam or inbox promotions if you
                      don&apos;t see the email in your inbox. If you still
                      cannot reset it, contact your Manila Prime administrator.
                    </span>
                  </div>

                  <Button
                    type="submit"
                    className="h-12 w-full rounded-2xl bg-[hsl(var(--accent))] text-base font-semibold text-[hsl(var(--accent-foreground))] shadow-[0_18px_45px_-24px_rgba(245,158,11,0.85)] transition-all duration-200 hover:bg-[hsl(var(--accent-hover))] hover:shadow-[0_24px_55px_-24px_rgba(245,158,11,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))] focus-visible:ring-offset-2 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-100"
                    disabled={loading}
                    aria-busy={loading}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      <span>{loading ? 'Sending...' : 'Send Reset Link'}</span>
                      {!loading && <ArrowRight className="h-4 w-4" />}
                    </span>
                  </Button>

                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-[hsl(var(--border))]" />
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))]">
                      or
                    </span>
                    <div className="h-px flex-1 bg-[hsl(var(--border))]" />
                  </div>

                  <div className="text-center">
                    <Link
                      href="/login/"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--accent))] transition hover:text-amber-600 hover:underline"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to Sign In
                    </Link>
                  </div>
                </form>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-center text-sm text-[hsl(var(--text-secondary))]">
            <ShieldCheck className="h-4 w-4 text-[hsl(var(--accent))]" />
            <span>
              Use the same credentials as your Manila Prime Staycation mobile
              app.
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
