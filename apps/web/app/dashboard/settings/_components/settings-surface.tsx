'use client';

import { useState, useEffect } from 'react';
import { Save, User, Shield, Bell, Gauge } from 'lucide-react';
import { toast } from 'sonner';

export function SettingsSurface() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    displayName: '',
    timezone: 'UTC',
    workingHoursStart: '09:00',
    workingHoursEnd: '17:00',
    interruptionBudget: 'BALANCED',
    autonomyLevel: 1,
  });
  const [preferences, setPreferences] = useState({
    verbosity: 'STANDARD',
    mambaPreference: 'ON_REQUEST',
    executionProfile: 'BALANCED',
  });

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d?.profile) setProfile(p => ({ ...p, ...(d.profile ?? {}) }));
        if (d?.preferences) setPreferences(p => ({ ...p, ...(d.preferences ?? {}) }));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, preferences, name: profile.displayName }),
      });
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6"><div className="h-40 bg-card animate-pulse rounded-lg" /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your WHINK operating parameters</p>
      </div>

      {/* Profile */}
      <Section title="Profile" icon={<User className="h-4 w-4" />}>
        <Field label="Display Name">
          <input value={profile.displayName ?? ''} onChange={e => setProfile(p => ({ ...p, displayName: e.target.value }))} className="input-field" />
        </Field>
        <Field label="Timezone">
          <select value={profile.timezone} onChange={e => setProfile(p => ({ ...p, timezone: e.target.value }))} className="input-field">
            {['UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Edmonton','Europe/London','Europe/Berlin','Asia/Tokyo','Australia/Sydney'].map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Work Start">
            <input type="time" value={profile.workingHoursStart} onChange={e => setProfile(p => ({ ...p, workingHoursStart: e.target.value }))} className="input-field" />
          </Field>
          <Field label="Work End">
            <input type="time" value={profile.workingHoursEnd} onChange={e => setProfile(p => ({ ...p, workingHoursEnd: e.target.value }))} className="input-field" />
          </Field>
        </div>
      </Section>

      {/* Autonomy & Permissions */}
      <Section title="Autonomy & Permissions" icon={<Shield className="h-4 w-4" />}>
        <Field label={`Autonomy Level: ${profile.autonomyLevel}`} description="0=Adviser, 1=Assistant, 2=Operator, 3=Delegate, 4=High Autonomy">
          <input type="range" min={0} max={4} value={profile.autonomyLevel} onChange={e => setProfile(p => ({ ...p, autonomyLevel: parseInt(e.target.value) }))} className="w-full accent-primary" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Adviser</span><span>Assistant</span><span>Operator</span><span>Delegate</span><span>High</span>
          </div>
        </Field>
      </Section>

      {/* Interruption Budget */}
      <Section title="Interruption Budget" icon={<Bell className="h-4 w-4" />}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {['QUIET','BALANCED','PROACTIVE','EXECUTIVE'].map(b => (
            <button
              key={b}
              onClick={() => setProfile(p => ({ ...p, interruptionBudget: b }))}
              className={`px-3 py-2 rounded-md text-xs font-mono transition-colors ${
                profile.interruptionBudget === b ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </Section>

      {/* Preferences */}
      <Section title="Intelligence Preferences" icon={<Gauge className="h-4 w-4" />}>
        <Field label="Verbosity">
          <select value={preferences.verbosity} onChange={e => setPreferences(p => ({ ...p, verbosity: e.target.value }))} className="input-field">
            <option value="QUICK">Quick</option>
            <option value="STANDARD">Standard</option>
            <option value="DEEP">Deep</option>
            <option value="EXECUTIVE">Executive</option>
          </select>
        </Field>
        <Field label="MAMBA Preference">
          <select value={preferences.mambaPreference} onChange={e => setPreferences(p => ({ ...p, mambaPreference: e.target.value }))} className="input-field">
            <option value="OFF">Off</option>
            <option value="ON_REQUEST">On Request</option>
            <option value="AUTO_SUGGEST">Auto Suggest</option>
          </select>
        </Field>
        <Field label="Execution Profile">
          <select value={preferences.executionProfile} onChange={e => setPreferences(p => ({ ...p, executionProfile: e.target.value }))} className="input-field">
            <option value="PERFORMANCE">Performance</option>
            <option value="BALANCED">Balanced</option>
            <option value="ECONOMY">Economy</option>
          </select>
        </Field>
      </Section>

      <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
        <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Settings'}
      </button>

      <style jsx>{`
        .input-field {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: hsl(var(--secondary));
          border: 1px solid hsl(var(--border));
          border-radius: 0.375rem;
          color: hsl(var(--foreground));
          font-size: 0.875rem;
        }
        .input-field:focus {
          outline: none;
          ring: 1px solid hsl(var(--primary));
        }
      `}</style>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-lg border border-border p-5">
      <h2 className="text-sm font-medium text-foreground flex items-center gap-2 mb-4">{icon} {title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1.5">{label}</label>
      {description && <p className="text-xs text-muted-foreground/70 mb-1.5">{description}</p>}
      {children}
    </div>
  );
}
