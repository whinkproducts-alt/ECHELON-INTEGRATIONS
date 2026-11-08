'use client';

import { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Orbit, ArrowLeft } from 'lucide-react';
import { useConversationWorkspace } from '@/components/shell/conversation-workspace-context';
import { useDashboardPersona } from '@/components/shell/persona-context';
import { officialAssets } from '@/lib/brand/official-assets';
import { dashboardJson, DashboardRequestError, readConversationEvents, isConversationPersona, type ConversationPersona } from '@/lib/dashboard-client';
import {
  Send, Plus, MessageSquare, Zap, ChevronDown,
  FolderKanban, Mic, MicOff, Volume2, VolumeX, Cpu, SlidersHorizontal, PanelLeft, HelpCircle
} from 'lucide-react';
import { HoloDrawer } from '@/components/ui/holo';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import {
  SLASH_COMMANDS, filterCommands, isSlashMenuOpen, commandInsertText, handleMenuKey, starterRequests,
  readOptionsFlag, writeOptionsFlag, type SlashCommand,
} from '@/components/screens/conversation-helpers/slash-commands';
import { useVoice } from '@/lib/hooks/useVoice';
import { speakApprovalRequest } from '@/lib/spoken-approval';
import { CitationChip, type CitationChipProps } from './citation-chip';
import { VoiceWaveform } from './voice-waveform';
import { ObsidianOverlay } from './obsidian-overlay';
import { NeuralLink, NeuralEvent } from '@/app/dashboard/_components/neural-link';
import { ToolTrace } from './tool-trace';
import { ApprovalCard } from './approval-card';
import {
  type ApprovalView, type CardState, type CardAction,
  approvalReducer, initialCardState, normalizeApproval, postDecision, secondsRemaining,
} from '@/lib/hooks/approval-state';

type SelectablePersona = ConversationPersona;
const isSelectablePersona = isConversationPersona;

interface Message {
  id: string;
  role: string;
  content: string;
  persona: string | null;
  mambaMode: string | null;
  functionalMode: string | null;
  createdAt: string;
  citations?: CitationChipProps[];
}

interface TraceEntry {
  id: string;
  tool: string;
  input?: unknown;
  result?: { success: boolean; data?: unknown };
  persona: string;
}

interface Conversation {
  id: string;
  title: string;
  projectId: string | null;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
}

function findLastIndexOf<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i])) return i;
  }
  return -1;
}

export function ConversationSurface({ initialPrompt = '', presentation = 'standard' }: { initialPrompt?: string; presentation?: 'standard' | 'presence' | 'obsidian' } = {}) {
  const persona = useDashboardPersona();
  const {input,setInput,activeConvId,setActiveConvId,selectedProject,setSelectedProject} = useConversationWorkspace();
  const router = useRouter();
  const [historyVersion, setHistoryVersion] = useState(0);
  const [projectsError, setProjectsError] = useState(false);
  const activePersona = isSelectablePersona(persona.state?.activePersona) ? persona.state.activePersona : null;
  const activeMambaMode = persona.state?.mambaMode ?? null;
  const isFounder = persona.state?.isFounder === true;
  const switchingPersona = persona.busy;
  const [requestError, setRequestError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const sendLock = useRef(false);
  const skipHistory = useRef<string | null>(null);
  const tenant = useTenantConfig();
  const productName = tenant.loading ? '' : tenant.productName;
  const opponentLabel = tenant.obsidianLabel;
  const cmdLabels = { productName: productName || 'your assistant', opponentLabel };
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const [listOpen, setListOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamPersona, setStreamPersona] = useState<SelectablePersona>('WHINK');
  const [streamMambaMode, setStreamMambaMode] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [voiceMode, setVoiceMode] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  useEffect(() => {
    const initial = setTimeout(() => {
      setOptionsOpen(readOptionsFlag());
      try {
        setVoiceMode(localStorage.getItem('whink-voice-mode') === 'true');
        const saved = localStorage.getItem('whink-preferred-model');
        if(saved) setSelectedModel(saved);
      } catch { /* Storage may be unavailable; use session defaults. */ }
    }, 0);
    return () => clearTimeout(initial);
  }, []);
  const [neuralOpen, setNeuralOpen] = useState(false);
  const [neuralEvents, setNeuralEvents] = useState<NeuralEvent[]>([]);
  const [traceEntries, setTraceEntries] = useState<TraceEntry[]>([]);
  const [streamCitations, setStreamCitations] = useState<CitationChipProps[]>([]);
  const streamCitationsRef = useRef<CitationChipProps[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { startListening, stopListening, speak, isListening, isSpeaking, supported, lipSyncAmplitude, voiceNotice } = useVoice({ speakerId: activePersona ?? 'WHINK' });

  // Approvals: cards live in the stream; state per id via a pure reducer.
  const [approvals, setApprovals] = useState<ApprovalView[]>([]);
  const [cardStates, dispatchCard] = useReducer(
    (m: Record<string, CardState>, a: { id: string; action: CardAction } | { id: string; init: true }) => {
      if ('init' in a) return m[a.id] ? m : { ...m, [a.id]: initialCardState };
      const cur = m[a.id] ?? initialCardState;
      const next = approvalReducer(cur, a.action);
      return next === cur ? m : { ...m, [a.id]: next };
    },
    {} as Record<string, CardState>,
  );
  const cardStatesRef = useRef(cardStates);
  useEffect(() => { cardStatesRef.current = cardStates; }, [cardStates]);

  const pushNeuralEvent = useCallback((type: NeuralEvent['type'], text: string) => {
    setNeuralEvents(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, type, text, ts: Date.now() },
    ]);
  }, []);

  const selectPersona = useCallback(async (next: SelectablePersona) => {
    if (sendLock.current) return;
    await persona.select(next);
  }, [persona]);

  const submitDecision = useCallback(async (id: string, decision: 'approve' | 'deny', voice?: { code: string }) => {
    const cur = cardStatesRef.current[id] ?? initialCardState;
    if (cur.phase !== 'pending') return;
    dispatchCard({ id, action: { type: 'submit' } });
    try {
      const response = await postDecision(id, decision, voice);
      dispatchCard({ id, action: { type: 'response', response } });
      pushNeuralEvent('approval', `${decision === 'approve' ? 'approve' : 'deny'} → ${response.status}`);
    } catch (e) {
      dispatchCard({ id, action: { type: 'request_failed', message: e instanceof Error ? e.message : 'Request failed' } });
    }
  }, [pushNeuralEvent]);

  const addApproval = useCallback((a: ApprovalView) => {
    setApprovals(prev => (prev.some(p => p.id === a.id) ? prev : [...prev, a]));
    dispatchCard({ id: a.id, init: true });
  }, []);

  // Spoken approval: reads the request aloud only. The decision is captured by the card's
  // push-to-talk control, never automatically, so the mic cannot hear the model or the prompt.
  const speakApproval = useCallback(async (a: ApprovalView) => {
    await speakApprovalRequest({ id: a.id, tool: a.tool, summary: a.summary });
  }, []);

  const hasPendingApproval = useCallback((): boolean => {
    return Object.values(cardStatesRef.current).some(
      st => st.phase === 'pending' || st.phase === 'submitting',
    );
  }, []);

  // Restore unexpired pending approvals on mount (async, no sync setState in the effect)
  useEffect(() => {
    fetch('/api/approvals?status=pending')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const list: unknown[] = Array.isArray(d?.approvals) ? d.approvals : [];
        const now = Date.now();
        for (const raw of list) {
          const a = normalizeApproval(raw);
          if (a && secondsRemaining(a.expiresAt, now) > 0) addApproval(a);
        }
      })
      .catch(() => {});
  }, [addApproval]);

  const loadConversationList = useCallback(async (signal?: AbortSignal) => {
    setListLoading(true); setListError(null);
    try {
      const data = await dashboardJson<Conversation[]>('/api/conversations', {signal});
      if (!Array.isArray(data)) throw new Error('Invalid conversation list');
      if (!signal?.aborted) setConversations(data);
    } catch { if (!signal?.aborted) setListError('Conversation history unavailable. Try again.'); }
    finally { if (!signal?.aborted) setListLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => { void loadConversationList(controller.signal); }, 0);
    dashboardJson<Project[]>('/api/projects', {signal:controller.signal}).then(data => { if(Array.isArray(data) && !controller.signal.aborted) setProjects(data); }).catch(() => {if(!controller.signal.aborted) setProjectsError(true);});
    dashboardJson<{preferences?: {preferredModel?: string}}>('/api/settings', {signal:controller.signal}).then(data => {
      if(data.preferences?.preferredModel && !localStorage.getItem('whink-preferred-model') && !controller.signal.aborted) setSelectedModel(data.preferences.preferredModel);
    }).catch(() => {});
    return () => { clearTimeout(initial); controller.abort(); };
  }, [loadConversationList]);

  useEffect(() => {
    const controller = new AbortController();
    if (activeConvId && skipHistory.current === activeConvId) { skipHistory.current = null; return; }
    const initial = setTimeout(() => {
      setMessages([]); setHistoryError(null); setNeuralEvents([]); setTraceEntries([]);
      if (!activeConvId) { setHistoryLoading(false); return; }
      setHistoryLoading(true);
      dashboardJson<Message[]>(`/api/conversations/${encodeURIComponent(activeConvId)}/messages`, {signal:controller.signal})
        .then(data => { if(!Array.isArray(data)) throw new Error('Invalid message history'); if(!controller.signal.aborted) setMessages(data); })
        .catch(() => { if(!controller.signal.aborted) setHistoryError('Messages could not be loaded. Retry loading before sending another message.'); })
        .finally(() => { if(!controller.signal.aborted) setHistoryLoading(false); });
    }, 0);
    return () => { clearTimeout(initial); controller.abort(); };
  }, [activeConvId, historyVersion]);

  useEffect(() => {
    if (!messages.length && !streamText) return;
    messagesEndRef.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'end'});
  }, [messages, streamText]);

  const createConversation = async () => {
    if(sendLock.current) return;
    setHistoryLoading(false); setActiveConvId(null); setMessages([]); setTraceEntries([]); setNeuralEvents([]); setHistoryError(null); setRequestError(null);
    inputRef.current?.focus();
  };

  const sendMessage = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || sendLock.current || !activePersona || switchingPersona || historyLoading || historyError) return;
    sendLock.current = true; setStreaming(true); setRequestError(null);
    let convId = activeConvId;
    let fullText = '';
    let replyPersona: SelectablePersona = activePersona;
    let mambaMode = activeMambaMode;
    let completed = false;
    let approvalArrived = false;
    let attempted = false;
    let rejected = false;
    const tempId = `temp-${Date.now()}`;
    setStreamPersona(activePersona); setStreamMambaMode(activeMambaMode);
    setStreamText(''); setTraceEntries([]); setStreamCitations([]); streamCitationsRef.current = [];
    try {
      if (!convId) {
        const conv = await dashboardJson<Conversation>('/api/conversations', {
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({title:text.slice(0,60),projectId:selectedProject}),
        });
        if(typeof conv.id !== 'string') throw new Error('Conversation was not created.');
        convId = conv.id; skipHistory.current = conv.id;
        setActiveConvId(conv.id); setConversations(previous => [conv,...previous]);
      }
      setMessages(previous => [...previous,{id:tempId,role:'user',content:text,persona:null,mambaMode:null,functionalMode:null,createdAt:new Date().toISOString()}]);
      setInput('');
      attempted = true;
      const response = await fetch(`/api/conversations/${encodeURIComponent(convId)}/messages`, {
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:text,projectId:selectedProject,...(selectedModel ? {model:selectedModel} : {})}),
      });
      if (!response.ok) { rejected = [401,403,404,429].includes(response.status); throw new DashboardRequestError(response.status); }
      if (!response.body) throw new Error('Response stream unavailable.');
      let persona: SelectablePersona = activePersona;
      await readConversationEvents(response.body, raw => {
        const data = raw as {
          type:string;content?:string;persona?:string;mambaMode?:string|null;name?:string;id?:string;input?:unknown;success?:boolean;data?:unknown;patterns?:unknown[];tool?:string;event?:string;approval?:unknown;documentName?:string;page?:number|null;chunkId?:string;score?:number|null;
        };
              if (data.type === 'text') {
                fullText += data.content ?? '';
                setStreamText(fullText);
                persona = isSelectablePersona(data.persona) ? data.persona : persona;
                mambaMode = data.mambaMode ?? null;
                setStreamPersona(persona);
                setStreamMambaMode(mambaMode);
              } else if (data.type === 'tool_call') {
                pushNeuralEvent('tool_call', data.name ?? data.tool ?? 'tool');
                const traceId = data.id ?? `trace-${Date.now()}-${Math.random()}`;
                setTraceEntries(prev => [
                  ...prev,
                  { id: traceId, tool: data.name ?? data.tool ?? 'tool', input: data.input, persona },
                ]);
              } else if (data.type === 'tool_result') {
                pushNeuralEvent('tool_result', data.content ?? 'result');
                const traceId = data.id ?? null;
                setTraceEntries(prev => {
                  // Match by id if available, otherwise update the last running entry for this tool
                  const idx = traceId
                    ? findLastIndexOf(prev, e => e.id === traceId)
                    : findLastIndexOf(prev, e => e.result === undefined);
                  if (idx === -1) return prev;
                  const updated = [...prev];
                  updated[idx] = {
                    ...updated[idx],
                    result: { success: data.success ?? true, data: data.data ?? data.content },
                  };
                  return updated;
                });
              } else if (data.type === 'security') {
                const patterns = Array.isArray(data.patterns) ? data.patterns.join(', ') : '';
                const where = data.tool ? ` in ${data.tool}` : '';
                pushNeuralEvent('security_event', `${data.event ?? 'security'}${where}${patterns ? `: ${patterns}` : ''}`);
              } else if (data.type === 'approval_required') {
                const a = normalizeApproval(data.approval);
                approvalArrived = true;
                if (a) {
                  addApproval(a);
                  pushNeuralEvent('approval', `awaiting approval: ${a.tool ?? a.kind}`);
                  if (voiceMode) {
                    // Fire and forget: must not block the stream loop
                    void speakApproval(a).catch(() => pushNeuralEvent('error','Spoken approval unavailable. Use the approval card.'));
                  }
                }
              } else if (data.type === 'citation') {
                const newCitation: CitationChipProps = {
                  documentName: data.documentName ?? '',
                  page: data.page ?? null,
                  chunkId: data.chunkId ?? undefined,
                  score: data.score ?? null,
                };
                const already = streamCitationsRef.current.some(c => c.documentName === newCitation.documentName && c.page === newCitation.page);
                if (!already) {
                  streamCitationsRef.current = [...streamCitationsRef.current, newCitation];
                  setStreamCitations([...streamCitationsRef.current]);
                }

              } else if (data.type === 'done') {
                completed = true;
                persona = isSelectablePersona(data.persona) ? data.persona : persona;
                mambaMode = data.mambaMode ?? mambaMode;
              }
        replyPersona = persona;
      });
      if (!completed) throw new Error('Response completion was not confirmed.');
      const capturedCitations = [...streamCitationsRef.current];
      if (fullText) setMessages(previous => [...previous,{id:`reply-${Date.now()}`,role:'assistant',content:fullText,persona:replyPersona,mambaMode,functionalMode:null,createdAt:new Date().toISOString(),citations:capturedCitations}]);
      setStreamText(''); setStreamCitations([]); streamCitationsRef.current = [];
      if (voiceMode && fullText && !approvalArrived && !hasPendingApproval()) void speak(fullText, replyPersona).catch(() => {});
    } catch (error) {
      if (!attempted || rejected) {
        setInput(text); setMessages(previous => previous.filter(message => message.id !== tempId));
        setRequestError(`${error instanceof DashboardRequestError ? error.message : 'Could not create the conversation.'} Your draft is preserved.`);
      } else {
        const partialCitations = [...streamCitationsRef.current];
        if (fullText) setMessages(previous => [...previous,{id:`partial-${Date.now()}`,role:'assistant',content:fullText,persona:replyPersona,mambaMode,functionalMode:null,createdAt:new Date().toISOString(),citations:partialCitations}]);
        setRequestError('Delivery or response completion could not be confirmed. Check conversation history before sending again.');
      }
      setStreamText(''); setStreamCitations([]); streamCitationsRef.current = []; pushNeuralEvent('error','Conversation request did not complete.');
    } finally {
      sendLock.current = false; setStreaming(false); await persona.refresh();
    }
  }, [input, activePersona, activeMambaMode, switchingPersona, historyLoading, historyError, activeConvId, selectedProject, selectedModel, voiceMode, speak, pushNeuralEvent, addApproval, speakApproval, hasPendingApproval, persona, setActiveConvId, setInput]);

  // Slash command menu: open while typing a command token, or from the Commands button.
  const typedMenu = isSlashMenuOpen(input) && dismissedFor !== input;
  const menuOpen = typedMenu || helpOpen;
  const menuCommands: SlashCommand[] = (typedMenu ? filterCommands(input) : SLASH_COMMANDS.slice()).filter(command => isFounder || command.name !== 'registration');
  const activeIndex = Math.min(menuIndex, Math.max(menuCommands.length - 1, 0));

  const chooseCommand = (c: SlashCommand) => {
    setInput(commandInsertText(c));
    setHelpOpen(false);
    setMenuIndex(0);
    inputRef.current?.focus();
  };

  const markOptionsUsed = () => { writeOptionsFlag(); };

  // Prefill from ?prompt=: the server page already sanitised it; here we only tidy the URL.
  useEffect(() => {
    if (!initialPrompt) return;
    Promise.resolve().then(() => {
      setInput(initialPrompt);
      window.history.replaceState(null, '', window.location.pathname);
      inputRef.current?.focus();
    });
  }, [initialPrompt, setInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.nativeEvent as KeyboardEvent).isComposing) return;
    if (menuOpen) {
      const r = handleMenuKey(e.key, activeIndex, menuCommands.length);
      if (r.kind === 'move') { e.preventDefault(); setMenuIndex(r.index); return; }
      if (r.kind === 'select') { e.preventDefault(); chooseCommand(menuCommands[r.index]); return; }
      if (r.kind === 'dismiss') { e.preventDefault(); setDismissedFor(input); setHelpOpen(false); return; }
    }
    if (e.key === 'Escape' && helpOpen) { setHelpOpen(false); return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const conversationList = (afterPick: () => void) => (
    <>
      <div className="conversation-history-heading"><p className="workspace-kicker">Your conversations</p></div>
      <div className="p-3 border-b border-border">
        <button
          disabled={streaming}
          onClick={() => { void createConversation(); afterPick(); }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" aria-hidden /> New conversation
        </button>
      </div>
      <div className="flex-1 overflow-auto py-2">
        {listLoading && <p role="status" className="p-4 text-xs text-muted-foreground">Loading conversations…</p>}
        {listError && <div className="p-4 text-xs text-muted-foreground" role="status">{listError}<button type="button" onClick={() => void loadConversationList()} className="mt-2 block text-primary">Retry history</button></div>}
        {!listLoading && !listError && !conversations.length && <p className="p-4 text-xs leading-relaxed text-muted-foreground">No conversations yet. Start with a question.</p>}
        {(conversations ?? []).map((conv: Conversation) => (
          <button
            key={conv.id}
            disabled={streaming}
            onClick={() => { setHistoryLoading(true); setHistoryError(null); setMessages([]); setHistoryVersion(version => version + 1); setActiveConvId(conv.id); setSelectedProject(conv.projectId); afterPick(); }}
            aria-current={activeConvId === conv.id ? 'true' : undefined}
            className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center gap-2 ${
              activeConvId === conv.id
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
            <span className="truncate">{conv.title}</span>
          </button>
        ))}
      </div>
    </>
  );

  const avatarPersona: SelectablePersona = streaming ? streamPersona : activePersona ?? 'WHINK';
  const avatarMambaMode = streaming ? streamMambaMode : activeMambaMode;

  return (
    <div className="canonical-conversation" data-presentation={presentation} data-persona={activePersona ?? 'unavailable'}>
      <div className="canonical-conversation-title"><div><p className="workspace-kicker">Think · challenge · decide</p><h1>Conversation<span className="text-primary">.</span></h1></div><nav aria-label="Conversation presentation"><Link href="/dashboard/conversation" aria-current={presentation === 'standard' ? 'page' : undefined} aria-disabled={streaming} onClick={event => {if(sendLock.current) event.preventDefault();}}>Workspace</Link><button type="button" disabled={streaming || switchingPersona} aria-current={presentation === 'presence' ? 'page' : undefined} onClick={async () => {if(!sendLock.current && await persona.select('WHINK')) router.push('/dashboard/holo/presence');}}><Orbit size={14} aria-hidden />WHINK</button><button type="button" disabled={streaming || switchingPersona} aria-current={presentation === 'obsidian' ? 'page' : undefined} onClick={async () => {if(!sendLock.current && await persona.select('MAMBA')) router.push('/dashboard/holo/obsidian');}}>MAMBA</button></nav></div>
      {/* Conversation history */}
      <div className="conversation-history">
        {conversationList(() => {})}
      </div>
      <HoloDrawer open={listOpen} onOpenChange={setListOpen} side="left" width="18rem" title="Conversations" returnFocusTo={historyTrigger}>
        <div className="-mx-2 flex max-h-[70dvh] flex-col">{conversationList(() => setListOpen(false))}</div>
      </HoloDrawer>

      {presentation !== 'standard' && <aside className="canonical-presence-stage" aria-label="Executive presence">
        <Link href="/dashboard/conversation" className="workspace-text-link"><ArrowLeft size={14} aria-hidden />Conversation workspace</Link>
        <div className="canonical-presence-portrait"><div className="canonical-presence-orbit" aria-hidden />{(activePersona === 'WHINK' || activePersona === 'MAMBA') ? <Image src={activePersona === 'MAMBA' ? officialAssets.mamba : officialAssets.whink} alt={`${activePersona}, official executive portrait`} width={1122} height={1402} sizes="(min-width:1200px) 340px, 200px" priority /> : <div className="p-8 text-muted-foreground">{activePersona ?? 'Confirming perspective…'}</div>}</div>
        <div className="canonical-presence-caption"><p className="workspace-kicker">{activePersona === 'MAMBA' ? 'Obsidian perspective' : 'Primary perspective'}</p><h2>{activePersona ?? 'Unavailable'}</h2><p>{activePersona === 'MAMBA' ? 'Examine assumptions. Explore the opposition. Find a stronger next move.' : 'Bring the context together. Clarify a decision. Move the work forward.'}</p><span className="canonical-presence-status">{isListening ? 'Microphone listening' : isSpeaking ? 'Audio speaking' : 'Microphone idle'}</span></div>
        <p className="canonical-presence-safety"><ShieldCheck size={16} aria-hidden />Same memory and permissions. Every approval and spending limit still applies.</p>
      </aside>}
      {/* Chat Area */}
      <ObsidianOverlay active={activeMambaMode === 'OBSIDIAN'}>
        <div className="canonical-chat-main">
          {/* Header: Avatar + persona pill | Voice toggle | Neural Link toggle | Project selector */}
          <div className="canonical-chat-toolbar">
            <button
              type="button"
              ref={historyTrigger}
              onClick={() => setListOpen(true)}
              aria-label="Conversations"
              className="canonical-history-toggle xl:hidden flex items-center gap-1 px-2 py-1 rounded text-xs bg-secondary text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <PanelLeft className="h-3.5 w-3.5" aria-hidden />
              Conversations
            </button>
            {/* Avatar + persona pill */}
            <div className="flex items-center gap-2">
              {(activePersona === 'WHINK' || activePersona === 'MAMBA') ? <Image src={activePersona === 'MAMBA' ? officialAssets.mamba : officialAssets.whink} alt="" width={40} height={50} loading="eager" className="canonical-toolbar-portrait" /> : <span className="canonical-agent-initial">{activePersona?.slice(0,1) ?? '—'}</span>}
              <label className="sr-only" htmlFor="conversation-agent-select">Select agent</label>
              <select
                id="conversation-agent-select"
                aria-label="Select agent"
                value={activePersona ?? ''}
                disabled={switchingPersona || streaming}
                onChange={(event) => { if (isSelectablePersona(event.target.value)) void selectPersona(event.target.value); }}
                className="max-w-36 rounded border border-border bg-background px-2 py-1 text-xs font-mono text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
              >
                {!activePersona && <option value="" disabled>Agent unavailable</option>}
                <option value="WHINK">WHINK · Assistant</option>
                <option value="MAMBA">MAMBA · Obsidian</option>
                <option value="PETER">PETER · Forensics</option>
                <option value="PAUL">PAUL · Reconstruction</option>
                <option value="MICAH">MICAH · Product audit</option>
                <option value="NANDI">NANDI · Growth &amp; marketing</option>
                <option value="SCOUT">Michael Carrick · Research &amp; opportunities</option>
                {isFounder && <option value="REGISTRATION">Website Registration · Founder only</option>}
              </select>
              <span
                className="text-xs font-mono font-medium px-1.5 py-0.5 rounded"
                style={{
                  color: avatarPersona === 'MAMBA' ? 'hsl(var(--mamba-blood))' : 'hsl(var(--whink-accent))',
                  background: avatarPersona === 'MAMBA' ? 'hsl(var(--mamba-blood) / 0.1)' : 'hsl(var(--whink-accent) / 0.1)',
                }}
              >
                {avatarPersona}{avatarMambaMode ? ` · ${avatarMambaMode}` : ''}
              </span>
            </div>

            <div className="flex-1" />

            {/* Mic state — always visible when live */}
            {isListening && (
              <span
                className="flex items-center gap-1 text-xs font-mono animate-pulse"
                style={{ color: 'hsl(var(--whink-accent))' }}
              >
                <Mic className="h-3 w-3" />
                Listening
              </span>
            )}
            {isSpeaking && (
              <span
                className="flex items-center gap-1.5 text-xs font-mono"
                style={{ color: 'hsl(var(--whink-accent))' }}
              >
                <Volume2 className="h-3 w-3" />
                Speaking
                <VoiceWaveform
                  amplitude={lipSyncAmplitude}
                  active={isSpeaking}
                  bars={10}
                  colorVar="var(--whink-accent)"
                />
              </span>
            )}

            {/* Voice mode toggle */}
            {(supported.stt || supported.tts) && (
              <button
                onClick={() => {
                  const next = !voiceMode;
                  setVoiceMode(next);
                  if (typeof window !== 'undefined') localStorage.setItem('whink-voice-mode', String(next));
                }}
                title={voiceMode ? 'Voice mode on. Click to turn off.' : 'Turn on voice mode'}
                aria-label="Voice mode"
                aria-pressed={voiceMode}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  voiceMode ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'
                } ${isSpeaking ? 'animate-pulse' : ''}`}
              >
                {voiceMode ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                <span className="font-mono">Voice{voiceMode ? ': on' : ''}</span>
              </button>
            )}

            {/* Options: model choice and activity feed */}
            <button
              type="button"
              onClick={() => setOptionsOpen(o => !o)}
              aria-expanded={optionsOpen}
              aria-controls="conversation-options"
              title="Model and activity feed"
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <SlidersHorizontal className="h-3 w-3" aria-hidden />
              <span>Options</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${optionsOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>

            <label className="canonical-project-select"><span className="sr-only">Project context</span><FolderKanban size={14} aria-hidden /><select aria-label="Project context" value={selectedProject ?? ''} disabled={streaming || projectsError} onChange={event => setSelectedProject(event.target.value || null)}><option value="">{projectsError ? 'Projects unavailable' : 'No project'}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>

          </div>

          {optionsOpen && (
            <div id="conversation-options" className="px-3 md:px-4 py-2 border-b border-border flex flex-wrap items-center gap-3 bg-card/30">
            {/* Neural Link toggle */}
              <button
                onClick={() => { setNeuralOpen(o => !o); markOptionsUsed(); }}
                title="Activity: live feed of what is happening"
                aria-label="Activity"
                aria-pressed={neuralOpen}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors font-mono ${
                  neuralOpen
                    ? 'bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                style={neuralOpen ? { color: 'hsl(var(--whink-accent))' } : {}}
              >
                <Zap className="h-3.5 w-3.5" />
                Activity
              </button>

              {/* Model picker */}
              <ModelPicker
                selected={selectedModel}
                onChange={(m) => {
                  setSelectedModel(m);
                  markOptionsUsed();
                  try { localStorage.setItem('whink-preferred-model', m); } catch {}
                  // Persist to user preferences
                  fetch('/api/settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ preferences: { preferredModel: m || null } }),
                  }).catch(() => {});

                }}
                disabled={streaming}
              />

            </div>
          )}

          {/* Messages + Neural Link panel side by side */}
          <div className="flex flex-1 min-h-0 relative">
            {/* Messages */}
            <div className="canonical-message-scroll">
              {historyLoading && <p role="status" className="p-5 text-sm text-muted-foreground">Loading messages…</p>}
              {historyError && <p role="alert" className="p-5 text-sm text-destructive">{historyError}<button type="button" onClick={() => setHistoryVersion(version => version + 1)} className="mt-2 block text-primary">Retry messages</button></p>}
              {(messages ?? []).length === 0 && !streamText && !historyLoading && !historyError && (
                <div className="flex min-h-full items-center justify-center">
                  <div className="canonical-welcome">
                    <p className="workspace-kicker">{activePersona === 'MAMBA' ? 'Obsidian · adversarial perspective' : 'Conversation · your workspace'}</p>
                    <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                      {!activePersona ? 'Choose an available perspective.' : activePersona === 'MAMBA' ? 'Before the next move, challenge the plan.' : 'What deserves your attention?'}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">Write a question, or choose a starting point to edit before sending.</p>
                    <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 text-left">
                      {starterRequests(opponentLabel).map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          disabled={streaming || switchingPersona || !activePersona || historyLoading || !!historyError}
                          onClick={() => { setInput(st.prompt); inputRef.current?.focus(); }}
                          className="rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-foreground transition-[transform,opacity] motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 hover:border-primary disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-6 text-xs text-muted-foreground">
                      {productName || 'Your assistant'} asks before it spends money, sends anything out, or shares private information.
                    </p>
                  </div>
                </div>
              )}

              {(messages ?? []).map((msg: Message) => (
                <MessageBubble key={msg.id} message={msg} onSpeak={msg.role === 'assistant' ? speak : undefined} />
              ))}


              {/* Inline tool traces — rendered between messages and the streaming reply */}
              {traceEntries.length > 0 && (
                <div className="space-y-0.5 pl-10">
                  {traceEntries.map(entry => (
                    <ToolTrace
                      key={entry.id}
                      tool={entry.tool}
                      input={entry.input}
                      result={entry.result}
                      persona={entry.persona}
                    />
                  ))}
                </div>
              )}

              {/* Approval cards: shown inline, never auto-decided */}
              {approvals.map(a => (
                <ApprovalCard
                  key={a.id}
                  approval={a}
                  state={cardStates[a.id] ?? initialCardState}
                  onTick={(secondsLeft) => dispatchCard({ id: a.id, action: { type: 'tick', secondsLeft } })}
                  onDecide={(d, v) => { void submitDecision(a.id, d, v); }}
                />
              ))}

              {/* Streaming message */}
              {streamText && (
                <div className={`flex gap-3 ${
                  streamPersona === 'MAMBA' ? 'mamba-glow' : ''
                }`}>
                  <div className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    streamPersona === 'MAMBA'
                      ? 'bg-[hsl(var(--mamba-blood)/0.1)] text-[hsl(var(--mamba-blood))]'
                      : 'bg-primary/10 text-primary'
                  }`}>
                    {streamPersona === 'MAMBA' ? 'M' : 'W'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-mono font-medium ${
                        streamPersona === 'MAMBA' ? 'text-[hsl(var(--mamba-blood))]' : 'text-primary'
                      }`}>
                        {streamPersona}{streamMambaMode ? ` • ${streamMambaMode}` : ''}
                      </span>
                    </div>
                    <div className="text-sm text-foreground whitespace-pre-wrap">
                      {streamText}
                      <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5" />
                    </div>
                    {/* Show citations as they arrive during streaming */}
                    {streamCitations.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {streamCitations.map((c, i) => (
                          <CitationChip key={`stream-cit-${i}`} {...c} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Neural Link slide-in panel */}
            <NeuralLink
              events={neuralEvents}
              open={neuralOpen}
              onClose={() => setNeuralOpen(false)}
            />
          </div>

          {/* Input */}
          <div className="canonical-composer">
            {(requestError || persona.error || voiceNotice) && <p role="alert" className="canonical-request-error">{requestError || persona.error || voiceNotice}</p>}
            {streaming && !streamText && <p role="status" className="mb-3 text-xs text-muted-foreground">Waiting for a response…</p>}
            <div className="relative max-w-3xl mx-auto">
              {menuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-border bg-card shadow-lg z-20 overflow-hidden">
                  <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">Commands</div>
                  <ul id="slash-menu" role="listbox" aria-label="Commands" className="max-h-64 overflow-auto py-1">
                    {menuCommands.map((c, i) => (
                      <li
                        key={c.name}
                        id={`slash-opt-${c.name}`}
                        role="option"
                        aria-selected={i === activeIndex}
                        onMouseDown={(e) => { e.preventDefault(); chooseCommand(c); }}
                        className={`cursor-pointer px-3 py-2 text-sm ${i === activeIndex ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
                      >
                        <span className="font-mono text-foreground">/{c.name}</span>
                        <span className="ml-2">{c.describe(cmdLabels)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <label htmlFor="conversation-input" className="sr-only">Message</label>
              <div className="flex gap-2 md:gap-3">
                <textarea
                  id="conversation-input"
                  ref={inputRef}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); setMenuIndex(0); setDismissedFor(null); if (helpOpen) setHelpOpen(false); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything, or type / for commands"
                  rows={1}
                  role="combobox"
                  aria-expanded={menuOpen}
                  aria-controls="slash-menu"
                  aria-autocomplete="list"
                  aria-activedescendant={menuOpen && menuCommands[activeIndex] ? `slash-opt-${menuCommands[activeIndex].name}` : undefined}
                  className="min-w-0 flex-1 px-3 md:px-4 py-3 bg-secondary rounded-lg border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm resize-none min-h-[44px] max-h-[120px]"
                  style={{ height: 'auto' }}
                  disabled={streaming || switchingPersona || !activePersona || historyLoading || !!historyError}
                />
                {supported.stt && (
                  <button
                    type="button"
                    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); startListening(); }}
                    onPointerUp={async () => { const text = await stopListening(); if(text.trim()) setInput(text.trim()); }}
                    onPointerCancel={() => { void stopListening(); }}
                    onKeyDown={event => { if((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); startListening(); } }}
                    onKeyUp={async event => { if(event.key === ' ' || event.key === 'Enter') { event.preventDefault(); const text = await stopListening(); if(text.trim()) setInput(text.trim()); } }}
                    onBlur={() => { void stopListening(); }}
                    title={isListening ? 'Listening… release to stop' : 'Hold to speak'}
                    aria-label={isListening ? 'Listening. Release to stop' : 'Hold to speak'}
                    disabled={streaming || switchingPersona || !activePersona || historyLoading || !!historyError}
                    className={`px-3 md:px-4 py-3 rounded-lg border transition-colors disabled:opacity-30 ${
                      isListening
                        ? 'bg-[hsl(var(--whink-accent)/0.15)] border-[hsl(var(--whink-accent))] text-[hsl(var(--whink-accent))] animate-pulse'
                        : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {isListening ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
                  </button>
                )}
                <button
                  onClick={() => { void sendMessage(); }}
                  disabled={!input.trim() || streaming || switchingPersona || !activePersona || historyLoading || !!historyError}
                  aria-label="Send"
                  className="px-3 md:px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-30"
                >
                  <Send className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2 max-w-3xl mx-auto">
              <button
                type="button"
                onClick={() => { setHelpOpen(o => !o); setMenuIndex(0); inputRef.current?.focus(); }}
                aria-expanded={helpOpen}
                aria-controls="slash-menu"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <HelpCircle className="h-3 w-3" aria-hidden />
                Commands
              </button>
              <span className="text-xs text-muted-foreground">Enter to send · Shift+Enter for a new line</span>
            </div>
          </div>
        </div>
      </ObsidianOverlay>
    </div>
  );
}

const MODEL_OPTIONS = [
  { value: '', label: 'Automatic routing', hint: 'Configured policy' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku', hint: 'Fast' },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet', hint: 'Balanced' },
  { value: 'claude-opus-5-5', label: 'Claude Opus', hint: 'Advanced' },
  { value: 'gpt-4o', label: 'GPT-4o', hint: 'OpenAI' },
  { value: 'wink-qwen3.5-9b-8k', label: 'Qwen 3.5 9B', hint: 'Local' },
  { value: 'llama3.1:8b', label: 'Llama 3.1 8B', hint: 'Local' },
];

function ModelPicker({ selected, onChange, disabled }: { selected:string; onChange:(model:string)=>void; disabled:boolean }) {
  return <label className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><Cpu size={14} aria-hidden /><span>Model preference</span><select aria-label="Model preference" disabled={disabled} value={selected} onChange={event => onChange(event.target.value)} className="min-h-9 max-w-40 rounded-md border border-border bg-background px-2 text-xs text-foreground">
    {!MODEL_OPTIONS.some(option => option.value === selected) && <option value={selected}>{selected}</option>}
    {MODEL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></label>;
}

function MessageBubble({ message, onSpeak }: { message: Message; onSpeak?: (text: string) => Promise<void> }) {
  const isUser = message.role === 'user';
  const isMamba = message.persona === 'MAMBA';
  const hasCitations = !isUser && Array.isArray(message.citations) && message.citations.length > 0;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] px-4 py-2.5 bg-primary/10 text-foreground rounded-lg text-sm">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isMamba ? 'mamba-glow' : ''}`}>
      {(message.persona === 'WHINK' || message.persona === 'MAMBA') ? <Image src={isMamba ? officialAssets.mamba : officialAssets.whink} alt="" width={32} height={40} className="h-10 w-8 shrink-0 rounded-md object-cover object-top" /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs text-muted-foreground">{message.persona?.slice(0,1) ?? '—'}</span>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className={`text-xs font-mono font-medium ${
            isMamba ? 'text-[hsl(var(--mamba-blood))]' : 'text-primary'
          }`}>
            {message.persona ?? 'WHINK'}{message.mambaMode ? ` • ${message.mambaMode}` : ''}
          </span>
          {message.functionalMode && (
            <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
              {message.functionalMode}
            </span>
          )}
          {onSpeak && (
            <button
              type="button"
              aria-label="Read aloud"
              title="Read aloud"
              onClick={() => { onSpeak(message.content).catch(() => {}); }}
              className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <Volume2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        <div className="text-sm text-foreground whitespace-pre-wrap">{message.content}</div>
        {/* Citation chips (C10) */}
        {hasCitations && (
          <div className="flex flex-wrap gap-2 mt-2">
            {(message.citations ?? []).map((c, i) => (
              <CitationChip key={`cit-${message.id}-${i}`} {...c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
