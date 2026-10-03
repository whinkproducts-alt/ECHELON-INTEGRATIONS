'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { AutonomyApprovalPanel } from '@/app/dashboard/settings/_components/autonomy-approval-panel';
import { interpretPatchResponse, resolveDecision, type AutonomyApproval } from '@/lib/autonomy-approval';
import type { DecisionStatus } from '@/lib/hooks/approval-state';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Edmonton',
  'America/Vancouver',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
];

const AUTONOMY_LABELS: Record<number, string> = {
  1: 'Ask before everything',
  2: 'Run Class A automatically (recommended)',
  3: 'Run Class A + B automatically',
  4: 'Maximum autonomy — Class A + B, broader delegation',
};

export function OnboardingStep({ step }: { step: number }) {
  const router = useRouter();
  const config = useTenantConfig();
  const [saving, setSaving] = useState(false);

  // Step 1 fields
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('America/Edmonton');
  const [roleTitle, setRoleTitle] = useState('');

  // Step 2 fields
  const [autonomyLevel, setAutonomyLevel] = useState(1);
  const [classCConfirmed, setClassCConfirmed] = useState(false);
  const [savedLevel, setSavedLevel] = useState(1);
  const [approval, setApproval] = useState<AutonomyApproval | null>(null);
  const [resolution, setResolution] = useState<{ tone: 'success' | 'neutral' | 'error'; message: string } | null>(null);
  const [step2Error, setStep2Error] = useState<string | null>(null);

  const onApprovalResolved = (status: DecisionStatus, detail: string | null) => {
    const res = resolveDecision(status, savedLevel, approval?.from ?? savedLevel, approval?.to ?? savedLevel, detail);
    setSavedLevel(res.savedLevel);
    setAutonomyLevel(res.sliderLevel);
    setResolution({ tone: res.tone, message: res.message });
  };

  const saveStep1 = async () => {
    if (!displayName.trim()) { toast.error('Display name is required'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { displayName: displayName.trim(), timezone, roleTitle } }),
      });
      if (!r.ok) throw new Error();
      router.push('/onboarding/step/2');
    } catch {
      toast.error('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveStep2 = async () => {
    if (autonomyLevel === 4 && !classCConfirmed) {
      toast.error('Please confirm full autonomy before continuing');
      return;
    }
    // A decision (any outcome) has been made, or no change was requested: move on.
    if (resolution || autonomyLevel === savedLevel) {
      router.push('/onboarding/step/3');
      return;
    }
    setSaving(true);
    setStep2Error(null);
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { autonomyLevel } }),
      });
      let body: unknown = null;
      try { body = await r.json(); } catch { /* no body */ }
      const outcome = interpretPatchResponse(r.status, body);
      if (outcome.kind === 'error') {
        setStep2Error(outcome.message);
        return;
      }
      if (outcome.kind === 'approval') {
        setApproval(outcome.approval);
        setAutonomyLevel(outcome.approval.to);
        return;
      }
      setSavedLevel(autonomyLevel);
      router.push('/onboarding/step/3');
    } catch {
      setStep2Error('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const productName = config.loading ? '...' : config.productName;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${n <= step ? 'bg-primary' : 'bg-muted'}`} />
              {n < 3 && <div className={`h-px flex-1 w-8 ${n < step ? 'bg-primary' : 'bg-border'}`} />}
            </div>
          ))}
          <span className="text-xs text-muted-foreground ml-2 font-mono">Step {step} of 3</span>
        </div>

        <div className="bg-card border border-border rounded-lg p-8 space-y-6">
          {step === 1 && (
            <>
              <div>
                <h1 className="text-2xl font-display font-bold tracking-tight">Who are you?</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {productName} uses this to address you and schedule around your time.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    Display Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Victor"
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    Role / Title <span className="text-muted-foreground/60">(optional)</span>
                  </label>
                  <input
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                    placeholder="e.g. Founder & CEO"
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <button
                onClick={saveStep1}
                disabled={saving}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Continue'}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h1 className="text-2xl font-display font-bold tracking-tight">How should I work?</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Set how much {productName} can do on your behalf without asking.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-2">
                    <span>Ask first</span>
                    <span>Full autonomy</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    value={autonomyLevel}
                    disabled={approval !== null && !resolution}
                    onChange={(e) => {
                      setApproval(null);
                      setResolution(null);
                      setAutonomyLevel(parseInt(e.target.value));
                      if (parseInt(e.target.value) !== 4) setClassCConfirmed(false);
                    }}
                    className="w-full accent-primary"
                  />
                  <div className="mt-3 p-3 bg-secondary rounded-md">
                    <p className="text-sm font-medium text-foreground">{AUTONOMY_LABELS[autonomyLevel]}</p>
                    {autonomyLevel === 1 && (
                      <p className="text-xs text-muted-foreground mt-1">Every action requires your explicit sign-off.</p>
                    )}
                    {autonomyLevel === 2 && (
                      <p className="text-xs text-muted-foreground mt-1">Safe, low-risk actions run automatically. Anything with external impact waits for you.</p>
                    )}
                    {autonomyLevel === 3 && (
                      <p className="text-xs text-muted-foreground mt-1">Most actions run automatically, including delegated tasks. Only irreversible or high-stakes actions wait.</p>
                    )}
                    {autonomyLevel === 4 && (
                      <p className="text-xs text-muted-foreground mt-1">Class A and B actions run automatically. Class C actions (irreversible, high-stakes) always wait for your approval at every level.</p>
                    )}
                  </div>
                </div>

                {autonomyLevel === 4 && (
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={classCConfirmed}
                      onChange={(e) => setClassCConfirmed(e.target.checked)}
                      className="mt-0.5 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground">
                      I understand that maximum autonomy lets Class A and B actions run without asking. Class C actions still always wait for my approval.
                    </span>
                  </label>
                )}
              </div>

              {autonomyLevel > savedLevel && !approval && (
                <p className="text-xs text-[hsl(var(--pending-amber))]">
                  Limit: raising autonomy is a Class C action. Continue will ask for your approval.
                </p>
              )}
              {step2Error && (
                <p role="alert" className="text-xs font-mono text-[hsl(var(--denial))]">Error: {step2Error}</p>
              )}
              {resolution && (
                <p
                  role={resolution.tone === 'error' ? 'alert' : 'status'}
                  className={`text-xs font-mono ${resolution.tone === 'error' ? 'text-[hsl(var(--denial))]' : 'text-foreground'}`}
                >
                  {resolution.tone === 'error' ? 'Error: ' : ''}{resolution.message}
                </p>
              )}
              {approval && (
                <div className="space-y-2">
                  <AutonomyApprovalPanel key={approval.view.id} approval={approval} onResolved={onApprovalResolved} />
                  {!resolution && (
                    <button
                      type="button"
                      onClick={() => router.push('/onboarding/step/3')}
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      Continue at level {savedLevel} without deciding. You can raise it later in Settings.
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => router.push('/onboarding/step/1')}
                  className="flex-1 py-2.5 bg-secondary text-foreground rounded-md text-sm font-medium hover:opacity-90"
                >
                  Back
                </button>
                <button
                  onClick={saveStep2}
                  disabled={saving || (autonomyLevel === 4 && !classCConfirmed) || (approval !== null && !resolution)}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Continue'}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <h1 className="text-2xl font-display font-bold tracking-tight">You are ready.</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Here is what was set up for your session.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Platform</span>
                  <span className="text-sm font-medium font-mono text-foreground">{productName}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Autonomy</span>
                  <span className="text-sm font-medium font-mono text-primary">Level {autonomyLevel}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Permission engine</span>
                  <span className="text-sm font-medium font-mono text-foreground">Active</span>
                </div>
              </div>

              <button
                onClick={() => router.push('/dashboard/conversation')}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
              >
                Enter {productName}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
