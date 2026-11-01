'use client';

import { useEffect, useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Fingerprint } from 'lucide-react';
import { BootSequence } from '@/components/shell/boot-sequence';
import { AuthShell, Field, PasswordInput, SubmitButton, btnSecondary, inputClass } from '@/components/screens/landing/ui';
import { cn } from '@/lib/utils';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <>
      <BootSequence />
      <div className="relative z-10">
        <AuthShell
          title="Sign in."
          lead="Pick up where you left off."
          footer={<>No account? <Link href="/signup" className="text-primary hover:underline">Create one</Link></>}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-5" suppressHydrationWarning>
            <Field id="login-email" label="Email" extraDescribedBy={error ? 'login-error' : undefined}>
              {({ id, describedBy }) => (
                <input
                  suppressHydrationWarning
                  id={id}
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  aria-describedby={describedBy}
                  className={inputClass}
                  placeholder="you@example.com"
                  required
                />
              )}
            </Field>
            <Field id="login-password" label="Password" extraDescribedBy={error ? 'login-error' : undefined}>
              {({ id, describedBy }) => (
                <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="current-password" describedBy={describedBy} />
              )}
            </Field>
            <div className="-mt-2 flex justify-end">
              <Link href="/forgot-password" className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Forgot password?</Link>
            </div>
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  aria-describedby="remember-hint"
                  className="h-4 w-4 rounded border-border accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                Keep me signed in for 30 days
              </label>
              <p id="remember-hint" className="pl-6 text-xs text-muted-foreground">Unchecked, you are signed out after 12 hours.</p>
            </div>
            <div id="login-error" role="alert" aria-live="assertive" className={cn('text-sm text-destructive', !error && 'hidden')}>{error}</div>
            <SubmitButton busy={loading} busyLabel="Signing in...">Sign in</SubmitButton>
          </form>
          <div className="mt-6 border-t border-border pt-6">
            {passkeySupported === true && (
              <button
                type="button"
                onClick={handlePasskey}
                disabled={passkeyBusy || loading}
                aria-busy={passkeyBusy || undefined}
                className={cn(btnSecondary, 'w-full')}
              >
                <Fingerprint className="h-4 w-4" aria-hidden />
                {passkeyBusy ? 'Waiting for your device...' : 'Sign in with a passkey (Touch ID)'}
              </button>
            )}
            {passkeySupported === false && (
              <p className="text-center text-xs text-muted-foreground">This browser does not support passkeys. Use your password.</p>
            )}
          </div>
        </AuthShell>
      </div>
    </>
  );
}
