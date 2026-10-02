'use client';

import { useState, useEffect } from 'react';
import { Save, User, Shield, Bell, Gauge, CreditCard, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { BillingSurface } from '../billing/_components/billing-surface';

type Tab = 'profile' | 'billing' | 'whitelabel';

export function SettingsSurface() {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // White label state
  const [wlProductName, setWlProductName] = useState('');
  const [wlAccentColor, setWlAccentColor] = useState('#38B6FF');
  const [wlLogoUrl, setWlLogoUrl] = useState('');
  const [wlSaving, setWlSaving] = useState(false);

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
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/tenant/config').then(r => r.json()),
    ])
      .then(([d, tc]) => {
        if (d?.profile) setProfile(p => ({ ...p, ...(d.profile ?? {}) }));
        if (d?.preferences) setPreferences(p => ({ ...p, ...(d.preferences ?? {}) }));
        if (d?.role === 'admin') setIsAdmin(true);
        if (tc?.productName) setWlProductName(tc.productName);
        if (tc?.accentColor) setWlAccentColor(tc.accentColor);
        if (tc?.logoUrl) setWlLogoUrl(tc.logoUrl ?? '');
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

  const saveWhiteLabel = async () => {
    setWlSaving(true);
    try {
      const r = await fetch('/api/tenant/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: wlProductName, accentColor: wlAccentColor, logoUrl: wlLogoUrl || null }),
      });
      if (r.status === 403) { toast.error('Admin access required'); return; }
      if (!r.ok) throw new Error();
      toast.success('White label settings saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setWlSaving(false);
    }
  };

  if (loading) return <div className="p-6"><div className="h-40 bg-card animate-pulse rounded-lg" /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your operating parameters</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {([
          { id: 'profile', label: 'Profile', icon: <User className="h-3.5 w-3.5" /> },
          { id: 'billing', label: 'Billing', icon: <CreditCard className="h-3.5 w-3.5" /> },
          ...(isAdmin ? [{ id: 'whitelabel', label: 'White Label', icon: <Palette className="h-3.5 w-3.5" /> }] : []),
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'billing' && <BillingSurface />}

      {activeTab === 'whitelabel' && isAdmin && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Palette className="h-4 w-4" /> White Label
          </h2>
          <Field label="Product Name">
            <input
              value={wlProductName}
              onChange={(e) => setWlProductName(e.target.value)}
              className="input-field"
            />
          </Field>
          <Field label="Accent Colour (hex)" description="Used as the primary brand colour. Must be a valid CSS hex value.">
            <div className="flex gap-2 items-center">
              <input
                value={wlAccentColor}
                onChange={(e) => setWlAccentColor(e.target.value)}
                className="input-field flex-1"
                placeholder="#38B6FF"
              />
              <div
                className="h-9 w-9 rounded-md border border-border flex-shrink-0"
                style={{ background: wlAccentColor }}
              />
            </div>
          </Field>
          <Field label="Logo URL" description="Publicly accessible URL to a PNG or SVG logo.">
            <input
              value={wlLogoUrl}
              onChange={(e) => setWlLogoUrl(e.target.value)}
              className="input-field"
              placeholder="https://..."
            />
          </Field>
          <button
            onClick={saveWhiteLabel}
            disabled={wlSaving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {wlSaving ? 'Saving...' : 'Save White Label'}
          </button>
        </div>
      )}

      {activeTab === 'profile' && (
        <>
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
        </>
      )}

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
