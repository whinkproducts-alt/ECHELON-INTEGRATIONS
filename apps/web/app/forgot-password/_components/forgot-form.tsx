'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { AuthShell, Field, SubmitButton, btnSecondary, inputClass } from '@/components/screens/landing/ui';
import { cn } from '@/lib/utils';

/** The confirmation is identical whatever the server says, so the form never reveals which addresses have accounts. */
const CONFIRMATION = 'If an account exists for that address, a reset link is on its way.';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setWait(false);
    try {
      const res = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // Too many requests is about the caller, not the address, so it is safe to say.
      if (res.status === 429) { setWait(true); return; }
    } catch {
      // Network failure also lands on the same confirmation text; nothing about the address is revealed.
    } finally {
      setBusy(false);
    }
    setSent(true);
  };

  return (
    <AuthShell
      title="Reset your password."
      lead="Enter the email you signed up with. We will send a link if there is an account for it."
      footer={<Link href="/login" className="text-primary hover:underline">Back to sign in</Link>}
    >
      {sent ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-5">
          <MailCheck className="h-8 w-8 text-primary" aria-hidden />
          <p className="text-base text-foreground">{CONFIRMATION}</p>
          <p className="text-sm text-muted-foreground">The link expires, so use it soon. Nothing arrived? Check spam, then try again.</p>
          <Link href="/login" className={cn(btnSecondary, 'w-full')}>Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" suppressHydrationWarning>
          <Field id="forgot-email" label="Email" error={wait ? 'Too many requests. Wait a minute and try again.' : undefined}>
            {({ id, describedBy, invalid }) => (
              <input suppressHydrationWarning id={id} name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-describedby={describedBy} aria-invalid={invalid || undefined} className={inputClass} placeholder="you@example.com" required />
            )}
          </Field>
          <SubmitButton busy={busy} busyLabel="Sending...">Send reset link</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
