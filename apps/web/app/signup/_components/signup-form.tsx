'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap } from 'lucide-react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';

export function SignupForm() {
  const router = useRouter();
  const { productName } = useTenantConfig();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [needsToken, setNeedsToken] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let live = true;
    // If the status call fails the form still shows; the server decides on submit.
    fetch('/api/signup/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d) return;
        if (d.open === false) setClosed(true);
        if (d.needsBootstrapToken === true) setNeedsToken(true);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(needsToken ? { email, password, name, bootstrapToken } : { email, password, name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // 403 means signup is closed on this instance; the server sends a plain message, show it as is.
        const msg = typeof data?.error === 'string' && data.error ? data.error : null;
        setError(msg ?? (res.status === 403 ? 'Signups are closed on this instance.' : 'Signup failed'));
        return;
      }
      // Auto-login
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setError('Account created. Please sign in.');
      } else {
        router.replace('/dashboard');
      }
    } catch {
      setError('Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-6">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Zap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">{productName}</h1>
          </div>
          <p className="text-sm text-muted-foreground font-mono">Initialize your operating system</p>
        </div>
        <div className="bg-card rounded-lg p-6 shadow-lg border border-border">
          <form onSubmit={handleSubmit} className="space-y-4" suppressHydrationWarning>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Name</label>
              <input suppressHydrationWarning type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 bg-secondary rounded-md border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm" placeholder="Your name" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Email</label>
              <input suppressHydrationWarning type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2.5 bg-secondary rounded-md border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm" placeholder="operator@whink.ai" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Password</label>
              <input suppressHydrationWarning type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2.5 bg-secondary rounded-md border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm" placeholder="••••••••" required minLength={6} />
            </div>
            {needsToken && (
              <div>
                <label htmlFor="signup-setup-token" className="block text-sm font-medium text-muted-foreground mb-1.5">Setup token</label>
                <input id="signup-setup-token" suppressHydrationWarning type="password" autoComplete="off" value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} disabled={closed} className="w-full px-3 py-2.5 bg-secondary rounded-md border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm" required aria-describedby="signup-setup-token-help" />
                <p id="signup-setup-token-help" className="mt-1 text-xs text-muted-foreground">The token set on the server as SIGNUP_BOOTSTRAP_TOKEN. Only the first account needs it.</p>
              </div>
            )}
            {closed && <p role="status" className="text-sm text-muted-foreground">Signups are closed on this instance.</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <button suppressHydrationWarning type="submit" disabled={loading || closed} className="w-full py-2.5 bg-primary text-primary-foreground rounded-md font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
              {loading ? 'Initializing...' : 'Create Account'}
            </button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Already initialized? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
