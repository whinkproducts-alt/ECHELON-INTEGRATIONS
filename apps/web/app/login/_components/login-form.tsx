'use client';

import { useEffect, useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Fingerprint } from 'lucide-react';
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
  const [remember, setRemember] = useState(false);
  // null until the browser has been checked on the client, so server and first client render match.
  const [passkeySupported, setPasskeySupported] = useState<boolean | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => { if (live) setPasskeySupported(browserSupportsWebAuthn()); });
    return () => { live = false; };
  }, []);

  const handlePasskey = async () => {
    setError('');
    setPasskeyBusy(true);
    try {
      const optRes = await fetch('/api/auth/passkey/login/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remember }),
      });
      if (optRes.status === 503) { setError('Passkeys are not set up on this server'); return; }
      if (!optRes.ok) { setError('Passkey sign-in failed. Try again or use your password.'); return; }
      const { options, challengeId } = await optRes.json();
      let response;
      try {
        response = await startAuthentication({ optionsJSON: options });
      } catch (e) {
        const name = e instanceof Error ? e.name : '';
        // Cancelling the prompt is a normal choice, not an error.
        if (name === 'NotAllowedError' || name === 'AbortError') return;
        setError('Passkey sign-in failed. Try again or use your password.');
        return;
      }
      const verRes = await fetch('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, response }),
      });
      if (verRes.status === 503) { setError('Passkeys are not set up on this server'); return; }
      if (verRes.status === 429) { setError('Too many attempts. Wait a moment and try again.'); return; }
      if (!verRes.ok) { setError('Passkey sign-in failed. Try again or use your password.'); return; }
      const { ticket } = await verRes.json();
      const result = await signIn('passkey', { ticket, redirect: false });
      if (result?.error) setError('Passkey sign-in failed. Try again or use your password.');
      else router.replace('/dashboard');
    } catch {
      setError('Passkey sign-in failed. Try again or use your password.');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email,
        password,
        remember: String(remember),
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
            <div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  aria-describedby="remember-hint"
                  className="h-4 w-4 rounded border-border accent-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                Keep me signed in for 30 days
              </label>
              <p id="remember-hint" className="mt-1 pl-6 text-xs text-muted-foreground">Unchecked, you are signed out after 12 hours.</p>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <button
              suppressHydrationWarning
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-md font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
          <div className="mt-4 border-t border-border pt-4">
            {passkeySupported === true && (
              <button
                type="button"
                onClick={handlePasskey}
                disabled={passkeyBusy || loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              >
                <Fingerprint className="h-4 w-4" aria-hidden />
                {passkeyBusy ? 'Waiting for your device...' : 'Sign in with a passkey (Touch ID)'}
              </button>
            )}
            {passkeySupported === false && (
              <p className="text-center text-xs text-muted-foreground">This browser does not support passkeys. Use your password.</p>
            )}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4">
            No account? <Link href="/signup" className="text-primary hover:underline">Create one</Link>
          </p>
        </HoloPanel>
      </div>
    </div>
  );
}
