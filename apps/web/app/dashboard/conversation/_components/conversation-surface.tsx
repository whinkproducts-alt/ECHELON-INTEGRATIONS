'use client';

import { useState, useEffect, useRef, useCallback, useReducer } from 'react';
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
import { AvatarRenderer, type AvatarRendererProps } from './avatar-renderer';
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

type SelectablePersona = 'WHINK' | 'MAMBA' | 'PETER' | 'PAUL' | 'MICAH' | 'NANDI' | 'SCOUT' | 'REGISTRATION';
const SELECTABLE_PERSONAS: readonly SelectablePersona[] = ['WHINK', 'MAMBA', 'PETER', 'PAUL', 'MICAH', 'NANDI', 'SCOUT', 'REGISTRATION'];
function isSelectablePersona(value: unknown): value is SelectablePersona {
  return typeof value === 'string' && SELECTABLE_PERSONAS.some((persona) => persona === value);
}

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

export function ConversationSurface({ initialPrompt = '' }: { initialPrompt?: string } = {}) {
  const tenant = useTenantConfig();
  const productName = tenant.loading ? '' : tenant.productName;
  const opponentLabel = tenant.obsidianLabel;
  const cmdLabels = { productName: productName || 'your assistant', opponentLabel };
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialPrompt);
  const [listOpen, setListOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(() => readOptionsFlag());
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamPersona, setStreamPersona] = useState<SelectablePersona>('WHINK');
  const [streamMambaMode, setStreamMambaMode] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<SelectablePersona>('WHINK');
  const [isFounder, setIsFounder] = useState(false);
  const [switchingPersona, setSwitchingPersona] = useState(false);
  const [activeMambaMode, setActiveMambaMode] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [voiceMode, setVoiceMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('whink-voice-mode') === 'true';
    }
    return false;
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('whink-preferred-model') ?? '';
    }
    return '';
  });
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [neuralOpen, setNeuralOpen] = useState(false);
  const [neuralEvents, setNeuralEvents] = useState<NeuralEvent[]>([]);
  const [traceEntries, setTraceEntries] = useState<TraceEntry[]>([]);
  const [streamCitations, setStreamCitations] = useState<CitationChipProps[]>([]);
  const streamCitationsRef = useRef<CitationChipProps[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { startListening, stopListening, speak, isListening, isSpeaking, supported, lipSyncAmplitude } = useVoice();

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

  useEffect(() => {
    let cancelled = false;
    fetch('/api/persona/state')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setIsFounder(data?.isFounder === true);
        if (cancelled || !isSelectablePersona(data?.activePersona)) return;
        setActivePersona(data.activePersona);
        setActiveMambaMode(data.activePersona === 'MAMBA' ? data.mambaMode ?? 'OBSIDIAN' : null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const pushNeuralEvent = useCallback((type: NeuralEvent['type'], text: string) => {
    setNeuralEvents(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, type, text, ts: Date.now() },
    ]);
  }, []);

  const selectPersona = useCallback(async (persona: SelectablePersona) => {
    if (switchingPersona || persona === activePersona) return;
    setSwitchingPersona(true);
    try {
      const response = await fetch('/api/persona/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona, mambaMode: persona === 'MAMBA' ? 'OBSIDIAN' : null }),
      });
      if (!response.ok) throw new Error('Agent switch was rejected');
      setActivePersona(persona);
      setActiveMambaMode(persona === 'MAMBA' ? 'OBSIDIAN' : null);
    } catch {
      pushNeuralEvent('error', 'Could not switch agent. Please try again.');
    } finally {
      setSwitchingPersona(false);
    }
  }, [activePersona, pushNeuralEvent, switchingPersona]);

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

  // Load conversations, projects, and saved model preference
  useEffect(() => {
    fetch('/api/conversations').then(r => r.json()).then(d => setConversations(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/projects').then(r => r.json()).then(d => setProjects(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/settings').then(r => r.json()).then(d => {
      const saved = d?.preferences?.preferredModel;
      if (saved && !localStorage.getItem('whink-preferred-model')) {
        setSelectedModel(saved);
      }
    }).catch(() => {});
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]); // eslint-disable-line react-hooks/set-state-in-effect
      setNeuralEvents([]);
      setTraceEntries([]);
      return;
    }
    fetch(`/api/conversations/${activeConvId}/messages`)
      .then(r => r.json())
      .then(d => setMessages(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [activeConvId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  const createConversation = async () => {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Conversation', projectId: selectedProject }),
    });
    const conv = await res.json();
    setConversations(prev => [conv, ...(prev ?? [])]);
    setActiveConvId(conv.id);
    setMessages([]);
    setNeuralEvents([]);
  };

  const sendMessage = useCallback(async (override?: string) => {
    const text = override ?? input;
    if (!text.trim() || streaming) return;

    let convId = activeConvId;
    if (!convId) {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: text.substring(0, 60), projectId: selectedProject }),
      });
      const conv = await res.json();
      convId = conv.id;
      setActiveConvId(conv.id);
      setConversations(prev => [conv, ...(prev ?? [])]);
      setNeuralEvents([]);
    }

    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      persona: null,
      mambaMode: null,
      functionalMode: null,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...(prev ?? []), userMsg]);
    setTraceEntries([]);
    setStreamCitations([]);
    streamCitationsRef.current = [];
    const messageText = text;
    setInput('');
    setStreaming(true);
    setStreamText('');

    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          projectId: selectedProject,
          ...(selectedModel ? { model: selectedModel } : {}),
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let persona: SelectablePersona = 'WHINK';
      let mambaMode: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'text') {
                fullText += data.content ?? '';
                setStreamText(fullText);
                persona = isSelectablePersona(data.persona) ? data.persona : 'WHINK';
                mambaMode = data.mambaMode ?? null;
                setStreamPersona(persona);
                setStreamMambaMode(mambaMode);
              } else if (data.type === 'tool_call') {
                pushNeuralEvent('tool_call', data.name ?? 'tool');
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
                if (a) {
                  addApproval(a);
                  pushNeuralEvent('approval', `awaiting approval: ${a.tool ?? a.kind}`);
                  if (voiceMode) {
                    // Fire and forget: must not block the stream loop
                    void speakApproval(a);
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
              } else if (data.type === 'error') {
                pushNeuralEvent('error', data.message ?? 'error');
              } else if (data.type === 'done') {
                persona = isSelectablePersona(data.persona) ? data.persona : persona;
                mambaMode = data.mambaMode ?? mambaMode;
              }
            } catch {}
          }
        }
      }

      // Persist active persona/mode for the header
      setActivePersona(persona);
      setActiveMambaMode(mambaMode);

      // Add completed message (capture current streamCitations via ref)
      const capturedCitations = streamCitationsRef.current.length > 0 ? [...streamCitationsRef.current] : undefined;
      const assistantMsg: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: fullText,
        persona,
        mambaMode,
        functionalMode: null,
        createdAt: new Date().toISOString(),
        citations: capturedCitations,
      };
      setMessages(prev => [...(prev ?? []), assistantMsg]);
      setStreamText('');
      setStreamCitations([]);
      streamCitationsRef.current = [];

      // Read response aloud if voice mode is on
      // Suppressed while an approval is pending so the reply can never be heard as a decision.
      if (voiceMode && fullText && !hasPendingApproval()) {
        speak(fullText).catch(() => {});
      }
    } catch (error) {
      console.error('Stream error:', error);
      pushNeuralEvent('error', String(error));
    } finally {
      setStreaming(false);
    }
  }, [input, setInput, streaming, activeConvId, selectedProject, selectedModel, voiceMode, speak, pushNeuralEvent, addApproval, speakApproval, hasPendingApproval]);

  // Slash command menu: open while typing a command token, or from the Commands button.
  const typedMenu = isSlashMenuOpen(input) && dismissedFor !== input;
  const menuOpen = typedMenu || helpOpen;
  const menuCommands: SlashCommand[] = typedMenu ? filterCommands(input) : SLASH_COMMANDS.slice();
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
      window.history.replaceState(null, '', window.location.pathname);
      inputRef.current?.focus();
    });
  }, [initialPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (menuOpen && typedMenu) {
      const r = handleMenuKey(e.key, activeIndex, menuCommands.length);
      if (r.kind === 'move') { e.preventDefault(); setMenuIndex(r.index); return; }
      if (r.kind === 'select') { e.preventDefault(); chooseCommand(menuCommands[r.index]); return; }
      if (r.kind === 'dismiss') { e.preventDefault(); setDismissedFor(input); return; }
    }
    if (e.key === 'Escape' && helpOpen) { setHelpOpen(false); return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const conversationList = (afterPick: () => void) => (
    <>
      <div className="p-3 border-b border-border">
        <button
          onClick={() => { void createConversation(); afterPick(); }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" aria-hidden /> New
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {(conversations ?? []).map((conv: Conversation) => (
          <button
            key={conv.id}
            onClick={() => { setActiveConvId(conv.id); afterPick(); }}
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

  const avatarPersona: SelectablePersona = streaming ? streamPersona : activePersona;
  const avatarMambaMode = streaming ? streamMambaMode : activeMambaMode;
  const avatarIsSpeaking = voiceMode && (streaming || isSpeaking);

  return (
    <div className="flex h-full">
      {/* Conversation list: fixed column from 768px, drawer below */}
      <div className="hidden md:flex w-64 border-r border-border flex-col bg-card/50">
        {conversationList(() => {})}
      </div>
      <HoloDrawer open={listOpen} onOpenChange={setListOpen} side="left" width="18rem" title="Conversations">
        <div className="-mx-2 flex max-h-[70dvh] flex-col">{conversationList(() => setListOpen(false))}</div>
      </HoloDrawer>

      {/* Chat Area */}
      <ObsidianOverlay active={activeMambaMode === 'OBSIDIAN'}>
        <div className="relative flex flex-col flex-1 min-h-0">
          {/* Header: Avatar + persona pill | Voice toggle | Neural Link toggle | Project selector */}
          <div className="px-3 md:px-4 py-2 border-b border-border flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={() => setListOpen(true)}
              aria-label="Conversations"
              className="md:hidden flex items-center gap-1 px-2 py-1 rounded text-xs bg-secondary text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <PanelLeft className="h-3.5 w-3.5" aria-hidden />
              Conversations
            </button>
            {/* Avatar + persona pill */}
            <div className="flex items-center gap-2">
              <AvatarRenderer
                persona={avatarPersona}
                mambaMode={avatarMambaMode}
                isSpeaking={avatarIsSpeaking}
                isListening={isListening}
                lipSyncAmplitude={avatarIsSpeaking ? lipSyncAmplitude : 0}
                size="sm"
              />
              <label className="sr-only" htmlFor="conversation-agent-select">Select agent</label>
              <select
                id="conversation-agent-select"
                aria-label="Select agent"
                value={activePersona}
                disabled={switchingPersona || streaming}
                onChange={(event) => { if (isSelectablePersona(event.target.value)) void selectPersona(event.target.value); }}
                className="max-w-36 rounded border border-border bg-background px-2 py-1 text-xs font-mono text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
              >
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

            {/* Project selector */}
            <div className="relative">
              <button
                onClick={() => setShowProjects(!showProjects)}
                aria-label="Project"
                aria-haspopup="menu"
                aria-expanded={showProjects}
                title="Project"
                className="flex items-center gap-2 px-3 py-1.5 text-xs bg-secondary rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                <FolderKanban className="h-3 w-3" />
                {selectedProject ? (projects ?? []).find((p: Project) => p.id === selectedProject)?.name ?? 'Project' : 'No Project'}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showProjects && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-card border border-border rounded-md shadow-lg z-10 py-1">
                  <button
                    onClick={() => { setSelectedProject(null); setShowProjects(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                  >
                    No Project
                  </button>
                  {(projects ?? []).map((p: Project) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedProject(p.id); setShowProjects(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                  setShowModelPicker(false);
                }}
                open={showModelPicker}
                onToggle={() => setShowModelPicker(o => !o)}
              />

            </div>
          )}

          {/* Messages + Neural Link panel side by side */}
          <div className="flex flex-1 min-h-0 relative">
            {/* Messages */}
            <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
              {(messages ?? []).length === 0 && !streamText && (
                <div className="flex min-h-full items-center justify-center">
                  <div className="w-full max-w-xl text-center py-6">
                    <Zap className="h-8 w-8 text-primary/40 mx-auto mb-4" aria-hidden />
                    <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                      {productName ? `${productName} is ready.` : 'Ready when you are.'}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">Ask for something, or start with one of these.</p>
                    <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 text-left">
                      {starterRequests(opponentLabel).map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          disabled={streaming}
                          onClick={() => { setInput(st.prompt); if (st.id === 'review') { inputRef.current?.focus(); } else { void sendMessage(st.prompt); } }}
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
          <div className="border-t border-border p-3 md:p-4">
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
                  aria-activedescendant={typedMenu && menuCommands[activeIndex] ? `slash-opt-${menuCommands[activeIndex].name}` : undefined}
                  className="min-w-0 flex-1 px-3 md:px-4 py-3 bg-secondary rounded-lg border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm resize-none min-h-[44px] max-h-[120px]"
                  style={{ height: 'auto' }}
                  disabled={streaming}
                />
                {supported.stt && (
                  <button
                    onMouseDown={() => {
                      startListening();
                    }}
                    onMouseUp={async () => {
                      const t = await stopListening();
                      if (t.trim()) setInput(t.trim());
                    }}
                    onTouchStart={() => startListening()}
                    onTouchEnd={async () => {
                      const t = await stopListening();
                      if (t.trim()) setInput(t.trim());
                    }}
                    title={isListening ? 'Listening… release to stop' : 'Hold to speak'}
                    aria-label={isListening ? 'Listening. Release to stop' : 'Hold to speak'}
                    disabled={streaming}
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
                  disabled={!input.trim() || streaming}
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
                onClick={() => { setHelpOpen(o => !o); setMenuIndex(0); }}
                aria-expanded={helpOpen}
                aria-controls="slash-menu"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <HelpCircle className="h-3 w-3" aria-hidden />
                Commands
              </button>
              <span className="text-xs text-muted-foreground/60">Type / for commands</span>
            </div>
          </div>
        </div>
      </ObsidianOverlay>
    </div>
  );
}

const MODEL_OPTIONS = [
  { value: '', label: 'Default', hint: 'env DEFAULT_MODEL' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku', hint: 'Fast' },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet', hint: 'Balanced' },
  { value: 'claude-opus-5-5', label: 'Claude Opus', hint: 'Advanced' },
  { value: 'gpt-4o', label: 'GPT-4o', hint: 'OpenAI' },
  { value: 'wink-qwen3.5-9b-8k', label: 'Qwen 3.5 9B', hint: 'Local' },
  { value: 'llama3.1:8b', label: 'Llama 3.1 8B', hint: 'Local' },
];

function ModelPicker({
  selected,
  onChange,
  open,
  onToggle,
}: {
  selected: string;
  onChange: (m: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const current = MODEL_OPTIONS.find(o => o.value === selected) ?? MODEL_OPTIONS[0];
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        title="Model"
        aria-label="Model"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors text-muted-foreground hover:text-foreground bg-secondary"
      >
        <Cpu className="h-3 w-3" />
        <span className="font-mono">{current.label}</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-52 bg-card border border-border rounded-md shadow-lg z-20 py-1">
          {MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                selected === opt.value
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <span className="font-mono">{opt.label}</span>
              <span className="text-muted-foreground/60">{opt.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, onSpeak }: { message: Message; onSpeak?: (text: string) => Promise<void> }) {
  const isUser = message.role === 'user';
  const isMamba = message.persona === 'MAMBA';
  const hasCitations = !isUser && Array.isArray(message.citations) && message.citations.length > 0;
  const isAssistantSpeaking = !isUser && (message.persona === 'WHINK' || message.persona === 'MAMBA');

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
      {/* Full-body avatar when WHINK/MAMBA are speaking, otherwise compact indicator */}
      {isAssistantSpeaking ? (
        <AvatarRenderer
          persona={message.persona as AvatarRendererProps['persona']}
          mambaMode={message.mambaMode ?? null}
          isSpeaking={true}
          isListening={false}
          fullBody={true}
          size="full"
        />
      ) : (
        <div className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
          isMamba ? 'bg-[hsl(var(--mamba-blood)/0.1)] text-[hsl(var(--mamba-blood))]' : 'bg-primary/10 text-primary'
        }`}>
          {isMamba ? 'M' : 'W'}
        </div>
      )}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
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
