'use client';

import { useState, useEffect } from 'react';
import { Save, User, Shield, Bell, Gauge, CreditCard, Palette, Key, Eye, EyeOff, Trash2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { BillingSurface } from '../billing/_components/billing-surface';

type Tab = 'profile' | 'billing' | 'apikeys' | 'whitelabel';

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
  const [savedAutonomy, setSavedAutonomy] = useState(1);
  const [autonomyNotice, setAutonomyNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
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
        if (typeof d?.profile?.autonomyLevel === 'number') setSavedAutonomy(d.profile.autonomyLevel);
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
    setAutonomyNotice(null);
    setSaveError(null);
    try {
      const raising = profile.autonomyLevel > savedAutonomy;
      const changed = profile.autonomyLevel !== savedAutonomy;
      // Raising is never sent with other fields; those go with the saved level.
      const sendLevel = changed && !raising;
      const { autonomyLevel: _level, ...rest } = profile;
      void _level;
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: sendLevel ? { ...rest, autonomyLevel: profile.autonomyLevel } : rest,
          preferences,
          name: profile.displayName,
        }),
      });
      if (!r.ok) {
        let msg = 'Failed to save';
        let requiresApproval = false;
        try {
          const d: { error?: string; requiresApproval?: boolean } = await r.json();
          if (d.error) msg = d.error;
          requiresApproval = r.status === 409 && d.requiresApproval === true;
        } catch { /* keep default message */ }
        if (requiresApproval) {
          setProfile(p => ({ ...p, autonomyLevel: savedAutonomy }));
          setAutonomyNotice('Raising autonomy needs approval \u2014 nothing was saved.');
        } else {
          setSaveError(msg);
          toast.error(msg);
        }
        return;
      }
      if (sendLevel) setSavedAutonomy(profile.autonomyLevel);
      if (raising) {
        setProfile(p => ({ ...p, autonomyLevel: savedAutonomy }));
        setAutonomyNotice('Other settings saved. Raising autonomy needs approval \u2014 the level was not changed.');
      } else {
        toast.success('Settings saved');
      }
    } catch {
      setSaveError('Failed to save');
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
          { id: 'apikeys', label: 'API Keys', icon: <Key className="h-3.5 w-3.5" /> },
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
      {activeTab === 'apikeys' && <ApiKeysSurface />}

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
              <input type="range" min={0} max={4} value={profile.autonomyLevel} onChange={e => { setAutonomyNotice(null); setProfile(p => ({ ...p, autonomyLevel: parseInt(e.target.value) })); }} className="w-full accent-primary" aria-describedby="autonomy-notice" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Adviser</span><span>Assistant</span><span>Operator</span><span>Delegate</span><span>High</span>
              </div>
              {profile.autonomyLevel > savedAutonomy && !autonomyNotice && (
                <p className="mt-2 text-xs text-[hsl(var(--pending-amber))]">Limit: raising autonomy needs approval and will not be saved.</p>
              )}
              {autonomyNotice && (
                <p id="autonomy-notice" role="status" className="mt-2 text-xs text-[hsl(var(--pending-amber))] border border-[hsl(var(--pending-amber)/0.2)] bg-[hsl(var(--pending-amber)/0.1)] rounded-md px-3 py-2">
                  Limit: {autonomyNotice}
                </p>
              )}
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

          {saveError && (
            <p role="alert" className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-md px-3 py-2">Error: {saveError}</p>
          )}
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

function ApiKeysSurface() {
  const [keys, setKeys] = useState<{ provider: string; keyHint: string; createdAt: string }[]>([]);
  const [anthropicInput, setAnthropicInput] = useState('');
  const [openaiInput, setOpenaiInput] = useState('');
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings/api-keys').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setKeys(d);
    }).catch(() => {});
  }, []);

  const storedKey = (provider: string) => keys.find(k => k.provider === provider);

  const save = async (provider: string, value: string) => {
    if (!value.trim()) return;
    setSaving(provider);
    try {
      const r = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key: value.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? 'Failed to save key'); return; }
      setKeys(prev => {
        const without = prev.filter(k => k.provider !== provider);
        return [...without, { provider, keyHint: d.keyHint, createdAt: new Date().toISOString() }];
      });
      if (provider === 'anthropic') setAnthropicInput('');
      if (provider === 'openai') setOpenaiInput('');
      toast.success(`${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} key saved`);
    } catch {
      toast.error('Failed to save key');
    } finally {
      setSaving(null);
    }
  };

  const remove = async (provider: string) => {
    try {
      await fetch(`/api/settings/api-keys/${provider}`, { method: 'DELETE' });
      setKeys(prev => prev.filter(k => k.provider !== provider));
      toast.success('Key removed');
    } catch {
      toast.error('Failed to remove key');
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Your API Keys (BYOK)" icon={<Key className="h-4 w-4" />}>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Connect your own provider keys. WHINK will use them instead of the server keys for your sessions.
          Keys are encrypted at rest with AES-256-GCM. Your billing stays under your own provider dashboard.
        </p>

        {/* Anthropic */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">Anthropic (Claude)</label>
            {storedKey('anthropic') && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-green-500 font-mono">
                  <CheckCircle className="h-3 w-3" />
                  ····{storedKey('anthropic')!.keyHint}
                </span>
                <button
                  onClick={() => remove('anthropic')}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Remove key"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showAnthropic ? 'text' : 'password'}
                value={anthropicInput}
                onChange={e => setAnthropicInput(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="input-field pr-9"
              />
              <button
                type="button"
                onClick={() => setShowAnthropic(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showAnthropic ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <button
              onClick={() => save('anthropic', anthropicInput)}
              disabled={!anthropicInput.trim() || saving === 'anthropic'}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
            >
              {saving === 'anthropic' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* OpenAI */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">OpenAI (GPT / o-series)</label>
            {storedKey('openai') && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-green-500 font-mono">
                  <CheckCircle className="h-3 w-3" />
                  ····{storedKey('openai')!.keyHint}
                </span>
                <button
                  onClick={() => remove('openai')}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Remove key"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showOpenai ? 'text' : 'password'}
                value={openaiInput}
                onChange={e => setOpenaiInput(e.target.value)}
                placeholder="sk-..."
                className="input-field pr-9"
              />
              <button
                type="button"
                onClick={() => setShowOpenai(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showOpenai ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <button
              onClick={() => save('openai', openaiInput)}
              disabled={!openaiInput.trim() || saving === 'openai'}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
            >
              {saving === 'openai' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Section>
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
