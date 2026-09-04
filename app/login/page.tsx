'use client';

import { Activity, LoaderCircle, LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SyntheticEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function signIn(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const result = await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    const next = new URLSearchParams(window.location.search).get('next');
    router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/');
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50 sm:p-9">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-emerald-400 text-slate-950">
            <Activity className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">SwingSignal</h1>
            <p className="text-sm text-slate-500">Private NSE research desk</p>
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <LockKeyhole className="size-4 text-emerald-600" /> Sign in
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Use the private account you created in Supabase. Public registration is not available.
          </p>
        </div>

        <form onSubmit={signIn} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <LoaderCircle className="animate-spin" />}
            {loading ? 'Signing in…' : 'Open dashboard'}
          </Button>
        </form>
      </section>
    </main>
  );
}
