'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, Plus, Edit, Archive, ExternalLink, MessageSquare, Bot, Target, AlertTriangle, FileText, Users, Building2, Zap, Lock, Unlock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LockdownButton } from '@/components/safety/lockdown-control';
import { listPending } from '@/lib/approvals';
import { isLockedDown, engageLockdown, releaseLockdown } from '@/lib/safety/lockdown';
import { listIdeas, createIdea, updateIdea, archiveIdea, listRecommendations } from '@/lib/ideas';
import { listInitiatives } from '@/lib/initiatives';
import { listSealedObjectives } from '@/lib/sealed-scope';

interface FounderOfficeProps {
  userId: string;
  userEmail: string | null;
}

interface ApprovalView {
  id: string;
  kind: string;
  tool: string | null;
  summary: string;
  params: Record<string, unknown> | null;
  contentHash: string;
  permissionClass: string;
  protected: boolean;
  category: string | null;
  confirmationCode: string | null;
  createdAt: string;
  expiresAt: string;
}

interface Idea {
  id: string;
  title: string;
  body: string;
  source: 'founder' | 'recommendation';
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  privacyScope: 'private' | 'shared';
}

interface Initiative {
  id: string;
  title: string;
  objective: string;
  status: 'queued' | 'working' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled';
  recipient: string;
  progress: number;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
}

export function FounderOffice({ userId, userEmail }: FounderOfficeProps) {
  const router = useRouter();
  const [approvals, setApprovals] = useState<ApprovalView[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [recommendations, setRecommendations] = useState<Idea[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [sealedObjectives, setSealedObjectives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lockdownState, setLockdownState] = useState<{ lockedDown: boolean; epoch: number; reason: string | null } | null>(null);
  const [showNewIdea, setShowNewIdea] = useState(false);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [newIdeaTitle, setNewIdeaTitle] = useState('');
  const [newIdeaBody, setNewIdeaBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [approvalsData, ideasData, recommendationsData, initiativesData, sealedData, lockdownData] = await Promise.all([
        fetch('/api/approvals?status=pending').then(r => r.ok ? r.json() : { approvals: [] }).then(d => d.approvals ?? []),
        fetch('/api/ideas?scope=private').then(r => r.ok ? r.json() : { ideas: [] }).then(d => d.ideas ?? []),
        fetch('/api/recommendations').then(r => r.ok ? r.json() : { recommendations: [] }).then(d => d.recommendations ?? []),
        fetch('/api/initiatives').then(r => r.ok ? r.json() : { initiatives: [] }).then(d => d.initiatives ?? []),
        fetch('/api/sealed/objectives').then(r => r.ok ? r.json() : { objectives: [] }).then(d => d.objectives ?? []),
        fetch('/api/safety/lockdown').then(r => r.ok ? r.json() : { state: { lockedDown: false, epoch: 0, reason: null } }).then(d => d.state),
      ]);
      setApprovals(approvalsData);
      setIdeas(ideasData);
      setRecommendations(recommendationsData);
      setInitiatives(initiativesData);
      setSealedObjectives(sealedData);
      setLockdownState(lockdownData);
    } catch (e) {
      setError('Failed to load office data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleEngageLockdown = async (reason?: string) => {
    try {
      const res = await fetch('/api/safety/lockdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'engage', ...(reason ? { reason } : {}) }),
      });
      if (res.ok) {
        const data = await res.json();
        setLockdownState(data.state);
      }
    } catch {
      setError('Failed to engage lockdown');
    }
  };

  const handleReleaseLockdown = async () => {
    if (!lockdownState) return;
    try {
      const res = await fetch('/api/safety/lockdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'release', confirm: 'RELEASE', expectedEpoch: lockdownState.epoch }),
      });
      if (res.ok) {
        const data = await res.json();
        setLockdownState(data.state);
      }
    } catch {
      setError('Failed to release lockdown');
    }
  };

  const handleApprove = async (approvalId: string) => {
    try {
      const res = await fetch('/api/approvals/' + approvalId + '/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approve' }),
      });
      if (res.ok) loadData();
    } catch {
      setError('Failed to approve');
    }
  };

  const handleDeny = async (approvalId: string) => {
    try {
      const res = await fetch('/api/approvals/' + approvalId + '/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'deny' }),
      });
      if (res.ok) loadData();
    } catch {
      setError('Failed to deny');
    }
  };

  const handleCreateIdea = async () => {
    if (!newIdeaTitle.trim()) return;
    try {
      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newIdeaTitle, body: newIdeaBody, privacyScope: 'private' }),
      });
      if (res.ok) {
        setNewIdeaTitle('');
        setNewIdeaBody('');
        setShowNewIdea(false);
        loadData();
      }
    } catch {
      setError('Failed to create idea');
    }
  };

  const handleUpdateIdea = async () => {
    if (!editingIdea || !newIdeaTitle.trim()) return;
    try {
      const res = await fetch('/api/ideas/' + editingIdea.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newIdeaTitle, body: newIdeaBody }),
      });
      if (res.ok) {
        setEditingIdea(null);
        setNewIdeaTitle('');
        setNewIdeaBody('');
        loadData();
      }
    } catch {
      setError('Failed to update idea');
    }
  };

  const handleArchiveIdea = async (ideaId: string) => {
    try {
      const res = await fetch('/api/ideas/' + ideaId, { method: 'DELETE' });
      if (res.ok) loadData();
    } catch {
      setError('Failed to archive idea');
    }
  };

  const handlePromoteIdea = async (idea: Idea) => {
    try {
      const res = await fetch('/api/initiatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: idea.title, 
          objective: idea.body, 
          recipient: 'marcus',
          sourceIdeaId: idea.id 
        }),
      });
      if (res.ok) loadData();
    } catch {
      setError('Failed to promote idea');
    }
  };

  const handleStartMarcusConversation = () => {
    router.push('/executive/office/marcus/new');
  };

  const destinationLinks = [
    { label: 'Kill Team', href: '/dashboard/kill-team', icon: Target, description: 'Founder-controlled specialist team' },
    { label: 'Boardroom', href: '/dashboard/board', icon: Users, description: 'Board members and advisers' },
    { label: 'WHINK', href: '/dashboard/conversation?persona=WHINK', icon: Bot, description: 'Chief of staff conversation' },
    { label: 'MAMBA', href: '/dashboard/conversation?persona=MAMBA', icon: Zap, description: 'Adversarial analysis mode' },
    { label: 'Marcus', href: '/executive/office/marcus', icon: MessageSquare, description: 'Private executive assistant' },
  ];

  const glassPanel: React.CSSProperties = {
    background: 'rgba(14,21,32,0.78)',
    border: '1px solid rgba(56,182,255,0.16)',
    borderRadius: 16,
    boxShadow: '0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
    backdropFilter: 'blur(12px)',
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading Founder Office…</div>
      </div>
    );
  }

  return (
    <div className="executive-office space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Founder Office</h1>
          <p className="text-muted-foreground mt-1">Unified action hub — lockdown, approvals, ideas, initiatives, and Marcus</p>
        </div>
        <div className="flex items-center gap-3">
          <LockdownButton />
        </div>
      </header>

      {lockdownState?.lockedDown && (
        <div className="border border-[hsl(var(--denial))] bg-[hsl(var(--denial)/0.12)] rounded-lg p-4" role="alert">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-[hsl(var(--denial))]" aria-hidden />
            <div className="flex-1">
              <p className="font-medium"><span className="font-mono text-xs uppercase tracking-wider text-[hsl(var(--denial))]">Lockdown Active.</span> New jobs, outbound actions, cloud models, microphone and camera are stopped.</p>
              {lockdownState.reason && <p className="text-sm text-muted-foreground">Reason: {lockdownState.reason}</p>}
            </div>
            <button
              onClick={handleReleaseLockdown}
              className="rounded-md bg-[hsl(var(--denial))] px-4 py-2 text-sm text-white hover:opacity-90 transition-opacity"
            >
              <Unlock className="h-4 w-4 inline mr-1" /> Release Lockdown
            </button>
          </div>
        </div>
      )}

      {!lockdownState?.lockedDown && (
        <button
          onClick={() => handleEngageLockdown('Manual engagement from Founder Office')}
          className="w-full sm:w-auto rounded-lg border border-border bg-[hsl(var(--base))] px-4 py-3 text-left hover:border-[hsl(var(--denial))] hover:text-[hsl(var(--denial))] transition-colors"
        >
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5" style={{ color: 'hsl(var(--denial))' }} aria-hidden />
            <div>
              <p className="font-medium">Engage Lockdown</p>
              <p className="text-sm text-muted-foreground">Stop new jobs, outbound actions, cloud models, microphone and camera</p>
            </div>
          </div>
        </button>
      )}

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {/* Pending Approvals */}
        <section className="lg:col-span-2 xl:col-span-3">
          <div className="space-y-4" style={glassPanel}>
            <div className="p-4 border-b border-border">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <AlertTriangle className="h-5 w-5" style={{ color: 'hsl(var(--pending-amber))' }} aria-hidden />
                Pending Approvals ({approvals.length})
              </h2>
            </div>
            {approvals.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3" style={{ color: 'hsl(var(--pending-amber))' }} aria-hidden />
                <p>No pending approvals</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {approvals.map((approval) => (
                  <div key={approval.id} className="rounded-lg border border-border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-medium">{approval.summary}</p>
                        <p className="text-sm text-muted-foreground mt-1 font-mono">{approval.kind} · {approval.tool ?? 'N/A'} · Class {approval.permissionClass}</p>
                        {approval.protected && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-xs font-mono bg-[hsl(var(--denial)/0.15)] text-[hsl(var(--denial))]">
                            <ShieldAlert className="h-3 w-3" aria-hidden />
                            Protected: {approval.category}
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">Expires: {new Date(approval.expiresAt).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleApprove(approval.id)}
                          className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleDeny(approval.id)}
                          className="rounded-md border border-[hsl(var(--denial))] px-3 py-1.5 text-sm text-[hsl(var(--denial))] hover:bg-[hsl(var(--denial)/0.1)] transition-colors"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                    {approval.params && (
                      <details className="text-sm">
                        <summary className="text-muted-foreground cursor-pointer">View parameters</summary>
                        <pre className="mt-2 p-3 rounded bg-[hsl(var(--base))] overflow-x-auto text-xs">{JSON.stringify(approval.params, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Ideas & Recommendations */}
        <section className="lg:col-span-2 xl:col-span-3">
          <div className="space-y-4" style={glassPanel}>
            <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <FileText className="h-5 w-5" aria-hidden />
                Ideas & Recommendations
              </h2>
              <button
                onClick={() => { setShowNewIdea(true); setEditingIdea(null); setNewIdeaTitle(''); setNewIdeaBody(''); }}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4 inline mr-1" /> New Idea
              </button>
            </div>

            {showNewIdea && (
              <div className="p-4 space-y-3 border border-border rounded-lg bg-[hsl(var(--base)/0.5)]">
                <h3 className="font-medium">{editingIdea ? 'Edit Idea' : 'New Idea'}</h3>
                <input
                  value={newIdeaTitle}
                  onChange={(e) => setNewIdeaTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <textarea
                  value={newIdeaBody}
                  onChange={(e) => setNewIdeaBody(e.target.value)}
                  placeholder="Body (optional)"
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={editingIdea ? handleUpdateIdea : handleCreateIdea}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
                  >
                    {editingIdea ? 'Save' : 'Create'}
                  </button>
                  <button
                    onClick={() => { setShowNewIdea(false); setEditingIdea(null); }}
                    className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-[hsl(var(--accent)/0.1)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="p-4 space-y-3">
              {ideas.length === 0 && recommendations.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <FileText className="h-12 w-12 mx-auto mb-3" aria-hidden />
                  <p>No ideas captured yet</p>
                </div>
              ) : (
                <>
                  {ideas.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider mb-2">Founder Ideas</h4>
                      <div className="space-y-2">
                        {ideas.map((idea) => (
                          <div key={idea.id} className="rounded-lg border border-border p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="font-medium">{idea.title}</p>
                                {idea.body && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{idea.body}</p>}
                                <p className="text-xs text-muted-foreground mt-1">{new Date(idea.createdAt).toLocaleDateString()}</p>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => { setEditingIdea(idea); setNewIdeaTitle(idea.title); setNewIdeaBody(idea.body); setShowNewIdea(true); }}
                                  className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--accent)/0.1)] transition-colors"
                                  title="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handlePromoteIdea(idea)}
                                  className="rounded p-1.5 text-muted-foreground hover:text-[hsl(var(--whink-accent))] hover:bg-[hsl(var(--whink-accent)/0.1)] transition-colors"
                                  title="Promote to Initiative"
                                >
                                  <Zap className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleArchiveIdea(idea.id)}
                                  className="rounded p-1.5 text-muted-foreground hover:text-[hsl(var(--denial))] hover:bg-[hsl(var(--denial)/0.1)] transition-colors"
                                  title="Archive"
                                >
                                  <Archive className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {recommendations.length > 0 && (
                    <div className="pt-4 border-t border-border">
                      <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider mb-2">Recommendations</h4>
                      <div className="space-y-2">
                        {recommendations.map((rec) => (
                          <div key={rec.id} className="rounded-lg border border-[hsl(var(--whink-accent)/0.3)] p-3 space-y-2 bg-[hsl(var(--whink-accent)/0.05)]">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{rec.title}</span>
                                  <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-[hsl(var(--whink-accent)/0.2)] text-[hsl(var(--whink-accent))]">RECOMMENDATION</span>
                                </div>
                                {rec.body && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{rec.body}</p>}
                                <p className="text-xs text-muted-foreground mt-1">{new Date(rec.createdAt).toLocaleDateString()}</p>
                              </div>
                              <button
                                onClick={() => handlePromoteIdea(rec)}
                                className="rounded p-1.5 text-muted-foreground hover:text-[hsl(var(--whink-accent))] hover:bg-[hsl(var(--whink-accent)/0.1)] transition-colors shrink-0"
                                title="Promote to Initiative"
                              >
                                <Zap className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* Active Initiatives */}
        <section className="lg:col-span-2 xl:col-span-3">
          <div className="space-y-4" style={glassPanel}>
            <div className="p-4 border-b border-border">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Target className="h-5 w-5" aria-hidden />
                Active Initiatives ({initiatives.filter(i => i.status !== 'completed' && i.status !== 'failed' && i.status !== 'cancelled').length})
              </h2>
            </div>
            {initiatives.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-3" aria-hidden />
                <p>No active initiatives</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {initiatives.map((initiative) => (
                  <div key={initiative.id} className="rounded-lg border border-border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{initiative.title}</h3>
                          <span className={`px-2 py-0.5 rounded text-xs font-mono ${
                            initiative.status === 'working' ? 'bg-blue-500/20 text-blue-400' :
                            initiative.status === 'awaiting_approval' ? 'bg-[hsl(var(--pending-amber))/20] text-[hsl(var(--pending-amber))]' :
                            initiative.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                            initiative.status === 'failed' ? 'bg-[hsl(var(--denial))/20] text-[hsl(var(--denial))]' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {initiative.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{initiative.objective}</p>
                        <p className="text-xs text-muted-foreground mt-1">Recipient: {initiative.recipient} · {new Date(initiative.createdAt).toLocaleDateString()}</p>
                        {initiative.progress > 0 && (
                          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-[hsl(var(--whink-accent))] transition-all duration-300" style={{ width: `${initiative.progress}%` }} />
                          </div>
                        )}
                      </div>
                      {initiative.result && (
                        <button className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--accent)/0.1)] transition-colors shrink-0" title="View result">
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Quick Access Destinations */}
        <section className="lg:col-span-2 xl:col-span-3">
          <div className="space-y-4" style={glassPanel}>
            <div className="p-4 border-b border-border">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Zap className="h-5 w-5" aria-hidden />
                Quick Access
              </h2>
            </div>
            <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {destinationLinks.map((dest) => (
                <Link
                  key={dest.label}
                  href={dest.href}
                  className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-center hover:border-[hsl(var(--whink-accent))] hover:bg-[hsl(var(--whink-accent)/0.05)] transition-colors"
                >
                  <dest.icon className="h-6 w-6 text-[hsl(var(--whink-accent))]" aria-hidden />
                  <span className="font-medium">{dest.label}</span>
                  <span className="text-xs text-muted-foreground">{dest.description}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Talk to Marcus - Prominent Entry */}
        <section className="lg:col-span-2 xl:col-span-3">
          <div className="relative overflow-hidden rounded-xl p-6" style={{
            background: 'linear-gradient(135deg, rgba(56,182,255,0.15), rgba(196,30,30,0.1))',
            border: '1px solid rgba(56,182,255,0.3)',
          }}>
            <div className="flex items-center justify-between">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-6 w-6" style={{ color: 'hsl(var(--whink-accent))' }} aria-hidden />
                  <span className="font-display text-lg font-semibold uppercase tracking-wider">Talk to Marcus</span>
                </div>
                <p className="text-muted-foreground max-w-2xl">
                  Private executive assistant — confidential conversations, consented memory, authorized execution.
                  Text or voice. Your words stay in the sealed scope.
                </p>
              </div>
              <button
                onClick={handleStartMarcusConversation}
                className="relative z-10 shrink-0 rounded-lg bg-[hsl(var(--whink-accent))] px-6 py-3 font-medium text-lg hover:bg-[hsl(var(--whink-accent))/0.9] transition-colors"
              >
                <MessageSquare className="h-5 w-5 inline mr-2" /> Start Conversation
              </button>
            </div>
            <div className="absolute inset-0 -z-10 opacity-20" aria-hidden>
              <svg viewBox="0 0 400 200" fill="none" className="w-full h-full">
                <circle cx="100" cy="50" r="80" stroke="currentColor" strokeWidth="0.5" />
                <circle cx="300" cy="150" r="120" stroke="currentColor" strokeWidth="0.5" />
                <path d="M100 130 Q200 50 300 130" stroke="currentColor" strokeWidth="0.5" />
              </svg>
            </div>
          </div>
        </section>

        {/* Sealed Objectives (Marcus/Tunde/Peter/Paul) */}
        {sealedObjectives.length > 0 && (
          <section className="lg:col-span-2 xl:col-span-3">
            <div className="space-y-4" style={glassPanel}>
              <div className="p-4 border-b border-border">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                  <Lock className="h-5 w-5" aria-hidden />
                  Sealed Objectives ({sealedObjectives.length})
                </h2>
              </div>
              <div className="p-4 space-y-3">
                {sealedObjectives.map((obj: any) => (
                  <div key={obj.id} className="rounded-lg border border-[hsl(var(--mamba-blood))/0.3] p-4 space-y-2 bg-[hsl(var(--mamba-blood))/0.03]">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4" style={{ color: 'hsl(var(--mamba-blood))' }} aria-hidden />
                      <h3 className="font-medium">{obj.title}</h3>
                      <span className="px-2 py-0.5 rounded text-xs font-mono bg-[hsl(var(--mamba-blood))/0.2] text-[hsl(var(--mamba-blood))]">
                        {obj.directorate ?? 'MARCUS'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-mono ${
                        obj.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                        obj.status === 'COMPLETED' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {obj.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground ml-6">{obj.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}