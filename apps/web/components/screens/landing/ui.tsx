'use client';
// Shared building blocks for the public pages (landing, auth, legal). Tokens only, no product names.
import * as React from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/brand';
import { LogoRotator } from '@/components/brand/logo-rotator';
import { HoloOrbBackdrop } from '@/components/ui/holo';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';

const BTN_BASE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-medium transition-[transform,opacity,background-color] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100';
export const btnPrimary = cn(BTN_BASE, 'bg-primary text-primary-foreground hover:opacity-90');
export const btnSecondary = cn(BTN_BASE, 'border border-border bg-transparent text-foreground hover:bg-secondary');
export const inputClass = 'w-full rounded-md border border-border bg-secondary px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive disabled:opacity-50';

/** Minimum length the password forms state. One place, so signup and reset say the same thing. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_RULES = `Use at least ${PASSWORD_MIN_LENGTH} characters. A longer phrase is stronger than a short complex one.`;

export function passwordStrength(pw: string): { level: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { level: 0, label: 'Not entered' };
  let score = 0;
  if (pw.length >= PASSWORD_MIN_LENGTH) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) score++;
  if (pw.length < PASSWORD_MIN_LENGTH) return { level: 1, label: 'Too short' };
  return score >= 3 ? { level: 3, label: 'Strong' } : score === 2 ? { level: 2, label: 'Fair' } : { level: 1, label: 'Weak' };
}

export function StrengthHint({ id, password }: { id: string; password: string }) {
  const s = passwordStrength(password);
  return (
    <div id={id} className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full', s.level >= i ? 'bg-primary' : 'bg-secondary')} />
        ))}
      </div>
      <span className="font-mono text-xs text-muted-foreground">Strength: {s.label}</span>
    </div>
  );
}

/** Label above, control, hint, then the error below. Pass the control as a render function so it receives the ids. */
export function Field({ id, label, hint, error, extraDescribedBy, children }: {
  id: string;
  /** id of an outside element (for example a form level alert) that also describes the control. */
  extraDescribedBy?: string;
  label: string;
  hint?: string;
  error?: string;
  children: (a: { id: string; describedBy: string | undefined; invalid: boolean }) => React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errId, extraDescribedBy].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
      <p id={errId ?? `${id}-error-slot`} role={error ? 'alert' : undefined} className={cn('text-sm text-destructive', !error && 'hidden')}>{error}</p>
    </div>
  );
}

export function PasswordInput({ id, value, onChange, autoComplete, describedBy, invalid, placeholder, minLength, disabled }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete: 'current-password' | 'new-password';
  describedBy?: string; invalid?: boolean; placeholder?: string; minLength?: number; disabled?: boolean;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <input
        suppressHydrationWarning
        id={id}
        name={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        minLength={minLength}
        disabled={disabled}
        required
        className={cn(inputClass, 'pr-11')}
      />
      <button
        suppressHydrationWarning
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        aria-controls={id}
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-[transform,color] duration-150 hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}

export function SubmitButton({ busy, busyLabel, disabled, children }: { busy: boolean; busyLabel: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button suppressHydrationWarning type="submit" disabled={busy || disabled} aria-busy={busy || undefined} className={cn(btnPrimary, 'w-full')}>
      {busy ? busyLabel : children}
    </button>
  );
}

/**
 * Split layout for auth pages: statement on the left (hidden detail on phones), form on the right.
 * Single column at phone width.
 */
export function AuthShell({ title, lead, children, footer }: { title: string; lead?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const { productName, acronymExpansion } = useTenantConfig();
  return (
    <div className="auth-surface relative min-h-[100dvh] overflow-hidden bg-background">
      <HoloOrbBackdrop stars={36} floor={false} className="opacity-40" />
      <div className="relative z-10 mx-auto grid min-h-[100dvh] w-full max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[1.1fr_minmax(0,26rem)] lg:items-center lg:gap-20 lg:py-16">
        <div className="flex flex-col gap-6">
          <Link href="/" aria-label={`${productName} home`} className="inline-flex w-fit items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BrandMark company="ultimate" size={44} glow={false} interactive={false} />
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">{productName}</span>
          </Link>
          <div className="flex flex-col gap-3 lg:mt-16">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">{acronymExpansion}</p>
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">{title}</h1>
            {lead && <p className="max-w-md text-base text-muted-foreground">{lead}</p>}
            <div className="hidden lg:block"><LogoRotator /></div>
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_20px_80px_#00000020] sm:p-8">{children}</div>
          {footer && <div className="text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

/** Live status line for forms: polite announcements, non-error. */
export function StatusNote({ children, id }: { children?: React.ReactNode; id?: string }) {
  return <p id={id} role="status" aria-live="polite" className={cn('text-sm text-muted-foreground', !children && 'hidden')}>{children}</p>;
}
