'use client';

import { useState } from 'react';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Signup failed');
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
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button suppressHydrationWarning type="submit" disabled={loading} className="w-full py-2.5 bg-primary text-primary-foreground rounded-md font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
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
