
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Home,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (user && !isUserLoading) {
      router.push('/');
    }
  }, [user, isUserLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!email || !password) return;

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast({
        title: 'Welcome back!',
        description: 'Successfully signed in to Manila Prime.',
      });
      router.push('/');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: error.message || 'Invalid credentials. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.13),_transparent_28%),linear-gradient(to_bottom,_hsl(var(--bg-primary)),_hsl(var(--bg-secondary)))] px-4 py-10 text-[hsl(var(--text-primary))]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="w-full max-w-[560px] space-y-8">
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

          <Card className="overflow-hidden rounded-[30px] border border-[var(--border)] bg-[hsl(var(--bg-surface))] p-1 shadow-[0_28px_90px_-40px_rgba(15,23,42,0.55)]">
            <CardHeader className="px-6 pb-4 pt-6 md:px-8">
              <div className="flex items-start gap-3 rounded-[20px] border border-amber-200/70 bg-amber-50/70 px-4 py-3 dark:border-amber-400/20 dark:bg-amber-500/10">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] shadow-sm">
                  <Lock className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold text-[hsl(var(--text-primary))]">Welcome back!</CardTitle>
                  <p className="mt-1 text-sm text-[hsl(var(--text-secondary))]">Sign in to continue to your dashboard</p>
                </div>
              </div>
            </CardHeader>

            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4 px-6 md:px-8">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold text-[hsl(var(--text-primary))]">Email Address</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-secondary))]" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="form-field pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password" className="text-sm font-semibold text-[hsl(var(--text-primary))]">Password</Label>
                    <Link href="/forgot-password" className="text-xs font-semibold text-[hsl(var(--accent))] underline-offset-4 transition hover:underline hover:text-amber-600">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-secondary))]" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="form-field pl-10 pr-11"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[hsl(var(--text-secondary))] transition hover:text-[hsl(var(--text-primary))]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[hsl(var(--text-secondary))]">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--border)] bg-[hsl(var(--bg-primary))] text-[hsl(var(--accent))] accent-[hsl(var(--accent))]"
                    />
                    Remember me
                  </label>
                </div>
              </CardContent>

              <CardFooter className="flex-col gap-4 px-6 pb-6 pt-2 md:px-8">
                <Button
                  type="submit"
                  className="h-12 w-full rounded-2xl bg-[hsl(var(--accent))] text-base font-semibold text-[hsl(var(--accent-foreground))] shadow-[0_18px_45px_-24px_rgba(245,158,11,0.85)] transition-all duration-200 hover:bg-[hsl(var(--accent-hover))] hover:shadow-[0_24px_55px_-24px_rgba(245,158,11,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))] focus-visible:ring-offset-2 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-100"
                  disabled={loading}
                  aria-busy={loading}
                >
                  <span className="flex items-center justify-center gap-2">
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    <span>{loading ? 'Signing in...' : 'Sign In to Dashboard'}</span>
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </span>
                </Button>
              </CardFooter>
            </form>
          </Card>

          <div className="flex items-center justify-center gap-2 text-center text-sm text-[hsl(var(--text-secondary))]">
            <ShieldCheck className="h-4 w-4 text-[hsl(var(--accent))]" />
            <span>Use the same credentials as your Manila Prime Staycation mobile app.</span>
          </div>
        </div>
      </div>
    </main>
  );
}
