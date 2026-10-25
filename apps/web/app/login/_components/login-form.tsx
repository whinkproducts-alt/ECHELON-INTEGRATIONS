'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { BrandMark } from '@/components/brand';
import { BootSequence } from '@/components/shell/boot-sequence';
import { HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';

export function LoginForm() {
  const router = useRouter();
  const { productName, acronymExpansion, tagline } = useTenantConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError('Invalid credentials');
      } else {
        router.replace('/dashboard');
      }
    } catch {
      setError('Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background overflow-hidden">
      <BootSequence />
      <HoloOrbBackdrop />
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-2">
            <BrandMark company="ultimate" size={112} />
          </div>
          <h1 className="holo-text-glow text-3xl font-display font-semibold tracking-tight text-foreground">{productName}</h1>
          <p className="mt-1 text-xs text-muted-foreground font-mono uppercase tracking-widest">{acronymExpansion}</p>
          <p className="mt-1 text-xs text-muted-foreground">{tagline}</p>
        </div>

        <HoloPanel glow="soft" brackets className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4" suppressHydrationWarning>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Email</label>
              <input
                suppressHydrationWarning
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-secondary rounded-md border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                placeholder="operator@whink.ai"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Password</label>
              <div className="relative">
                <input
                  suppressHydrationWarning
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 bg-secondary rounded-md border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                  placeholder="••••••••"
                  required
                />
                <button suppressHydrationWarning type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              suppressHydrationWarning
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-md font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            No account? <Link href="/signup" className="text-primary hover:underline">Create one</Link>
          </p>
        </HoloPanel>
      </div>
    </div>
  );
}
