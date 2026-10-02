'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Plus, MessageSquare, Zap, ChevronDown,
  FolderKanban, Mic, MicOff, Volume2, VolumeX
} from 'lucide-react';
import { useVoice } from '@/lib/hooks/useVoice';
import { AvatarRenderer } from './avatar-renderer';
import { ObsidianOverlay } from './obsidian-overlay';
import { NeuralLink, NeuralEvent } from '@/app/dashboard/_components/neural-link';

interface Message {
  id: string;
  role: string;
  content: string;
  persona: string | null;
  mambaMode: string | null;
  functionalMode: string | null;
  createdAt: string;
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

export function ConversationSurface() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamPersona, setStreamPersona] = useState<'WHINK' | 'MAMBA'>('WHINK');
  const [streamMambaMode, setStreamMambaMode] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<'WHINK' | 'MAMBA'>('WHINK');
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
  const [neuralOpen, setNeuralOpen] = useState(false);
  const [neuralEvents, setNeuralEvents] = useState<NeuralEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { startListening, stopListening, speak, isListening, isSpeaking, supported } = useVoice();

  const pushNeuralEvent = useCallback((type: NeuralEvent['type'], text: string) => {
    setNeuralEvents(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, type, text, ts: Date.now() },
    ]);
  }, []);

  // Load conversations and projects
  useEffect(() => {
    fetch('/api/conversations').then(r => r.json()).then(d => setConversations(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/projects').then(r => r.json()).then(d => setProjects(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]); // eslint-disable-line react-hooks/set-state-in-effect
      setNeuralEvents([]); // eslint-disable-line react-hooks/set-state-in-effect
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

  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming) return;

    let convId = activeConvId;
    if (!convId) {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.substring(0, 60), projectId: selectedProject }),
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
      content: input,
      persona: null,
      mambaMode: null,
      functionalMode: null,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...(prev ?? []), userMsg]);
    const messageText = input;
    setInput('');
    setStreaming(true);
    setStreamText('');

    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, projectId: selectedProject }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let persona: 'WHINK' | 'MAMBA' = 'WHINK';
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
                persona = (data.persona as 'WHINK' | 'MAMBA') ?? 'WHINK';
                mambaMode = data.mambaMode ?? null;
                setStreamPersona(persona);
                setStreamMambaMode(mambaMode);
              } else if (data.type === 'tool_call') {
                pushNeuralEvent('tool_call', data.name ?? 'tool');
              } else if (data.type === 'tool_result') {
                pushNeuralEvent('tool_result', data.content ?? 'result');
              } else if (data.type === 'error') {
                pushNeuralEvent('error', data.message ?? 'error');
              } else if (data.type === 'done') {
                persona = (data.persona as 'WHINK' | 'MAMBA') ?? persona;
                mambaMode = data.mambaMode ?? mambaMode;
              }
            } catch {}
          }
        }
      }

      // Persist active persona/mode for the header
      setActivePersona(persona);
      setActiveMambaMode(mambaMode);

      // Add completed message
      const assistantMsg: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: fullText,
        persona,
        mambaMode,
        functionalMode: null,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...(prev ?? []), assistantMsg]);
      setStreamText('');

      // Read response aloud if voice mode is on
      if (voiceMode && fullText) {
        speak(fullText).catch(() => {});
      }
    } catch (error) {
      console.error('Stream error:', error);
      pushNeuralEvent('error', String(error));
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, activeConvId, selectedProject, voiceMode, speak, pushNeuralEvent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const avatarPersona: 'WHINK' | 'MAMBA' = streaming ? streamPersona : activePersona;
  const avatarMambaMode = streaming ? streamMambaMode : activeMambaMode;
  const avatarIsSpeaking = voiceMode && (streaming || isSpeaking);

  return (
    <div className="flex h-full">
      {/* Conversation List */}
      <div className="w-64 border-r border-border flex flex-col bg-card/50">
        <div className="p-3 border-b border-border">
          <button
            onClick={createConversation}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        </div>
        <div className="flex-1 overflow-auto py-1">
          {(conversations ?? []).map((conv: Conversation) => (
            <button
              key={conv.id}
              onClick={() => setActiveConvId(conv.id)}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                activeConvId === conv.id
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{conv.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <ObsidianOverlay active={activeMambaMode === 'OBSIDIAN'}>
        <div className="relative flex flex-col flex-1 min-h-0">
          {/* Header: Avatar + persona pill | Voice toggle | Neural Link toggle | Project selector */}
          <div className="px-4 py-2 border-b border-border flex items-center gap-3">
            {/* Avatar + persona pill */}
            <div className="flex items-center gap-2">
              <AvatarRenderer
                persona={avatarPersona}
                mambaMode={avatarMambaMode}
                isSpeaking={avatarIsSpeaking}
                isListening={isListening}
                size="sm"
              />
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
                style={{ color: 'hsl(var(--denial))' }}
              >
                <Mic className="h-3 w-3" />
                Listening
              </span>
            )}
            {isSpeaking && (
              <span
                className="flex items-center gap-1 text-xs font-mono animate-pulse"
                style={{ color: 'hsl(var(--whink-accent))' }}
              >
                <Volume2 className="h-3 w-3" />
                Speaking
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
                title={voiceMode ? 'Voice mode on — click to disable' : 'Enable voice mode'}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  voiceMode ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'
                } ${isSpeaking ? 'animate-pulse' : ''}`}
              >
                {voiceMode ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                <span className="font-mono">Voice</span>
              </button>
            )}

            {/* Neural Link toggle */}
            <button
              onClick={() => setNeuralOpen(o => !o)}
              title="Neural Link — live activity feed"
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors font-mono ${
                neuralOpen
                  ? 'bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              style={neuralOpen ? { color: 'hsl(var(--whink-accent))' } : {}}
            >
              <Zap className="h-3.5 w-3.5" />
              Neural Link
            </button>

            {/* Project selector */}
            <div className="relative">
              <button
                onClick={() => setShowProjects(!showProjects)}
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

          {/* Messages + Neural Link panel side by side */}
          <div className="flex flex-1 min-h-0 relative">
            {/* Messages */}
            <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
              {(messages ?? []).length === 0 && !streamText && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Zap className="h-10 w-10 text-primary/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground font-mono">{avatarPersona} online.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Type a command or start a conversation.</p>
                  </div>
                </div>
              )}

              {(messages ?? []).map((msg: Message) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {/* Streaming message */}
              {streamText && (
                <div className={`flex gap-3 ${
                  streamPersona === 'MAMBA' ? 'mamba-glow' : ''
                }`}>
                  <div className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    streamPersona === 'MAMBA'
                      ? 'bg-amber-400/10 text-amber-400'
                      : 'bg-primary/10 text-primary'
                  }`}>
                    {streamPersona === 'MAMBA' ? 'M' : 'W'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-mono font-medium ${
                        streamPersona === 'MAMBA' ? 'text-amber-400' : 'text-primary'
                      }`}>
                        {streamPersona}{streamMambaMode ? ` • ${streamMambaMode}` : ''}
                      </span>
                    </div>
                    <div className="text-sm text-foreground whitespace-pre-wrap">
                      {streamText}
                      <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5" />
                    </div>
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
          <div className="border-t border-border p-4">
            <div className="flex gap-3 max-w-3xl mx-auto">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a command or message..."
                rows={1}
                className="flex-1 px-4 py-3 bg-secondary rounded-lg border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm resize-none min-h-[44px] max-h-[120px]"
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
                  disabled={streaming}
                  className={`px-4 py-3 rounded-lg border transition-colors disabled:opacity-30 ${
                    isListening
                      ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse'
                      : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              <button
                onClick={sendMessage}
                disabled={!input.trim() || streaming}
                className="px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-30"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-3 mt-2 max-w-3xl mx-auto">
              <span className="text-xs text-muted-foreground/50 font-mono">
                /mamba • /whink • /brief • /deep • /plan • /status
              </span>
            </div>
          </div>
        </div>
      </ObsidianOverlay>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const isMamba = message.persona === 'MAMBA';

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
      <div className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
        isMamba ? 'bg-amber-400/10 text-amber-400' : 'bg-primary/10 text-primary'
      }`}>
        {isMamba ? 'M' : 'W'}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-mono font-medium ${
            isMamba ? 'text-amber-400' : 'text-primary'
          }`}>
            {message.persona ?? 'WHINK'}{message.mambaMode ? ` • ${message.mambaMode}` : ''}
          </span>
          {message.functionalMode && (
            <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
              {message.functionalMode}
            </span>
          )}
        </div>
        <div className="text-sm text-foreground whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
}
