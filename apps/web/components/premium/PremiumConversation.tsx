'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ArrowUp, ShieldCheck, Orbit, MessageSquare } from 'lucide-react';
import { officialAssets } from '@/lib/brand/official-assets';
import { PERSONAS, type PersonaType } from '@/lib/personas';
import { canConverse, readConversationStream } from '@/lib/dashboard-client';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  persona: PersonaType;
  at: number;
  delivery?: 'sending' | 'sent' | 'unsent' | 'unconfirmed';
};

/**
 * Conversation surface. Real send path: creates a conversation, posts the
 * message, and reads the SSE stream from /api/conversations/:id/messages.
 * Dense styling to match the operations shell; no cartoon chat chrome.
 */
export function PremiumConversation({
  activePersona,
  onPersonaChange,
  personaBusy = false,
  personaError,
  onSendingChange,
  onComplete,
}: {
  activePersona: PersonaType | null;
  onPersonaChange: (p: PersonaType) => void;
  personaBusy?: boolean;
  personaError?: string | null;
  onSendingChange?: (busy: boolean) => void;
  onComplete?: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const config = activePersona ? PERSONAS[activePersona] : null;
  const canSend = canConverse(activePersona) && !personaBusy && !personaError;
  const inFlight = useRef(false);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || inFlight.current || !canSend || !activePersona) return;
    inFlight.current = true;
    setError(null);
    setSending(true);
    onSendingChange?.(true);
    setInput('');
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
      persona: activePersona,
      at: Date.now(),
      delivery: 'sending',
    };
    const assistantId = `a-${Date.now()}`;
    setMessages((m) => [...m, userMsg]);

    let submitted = false;
    try {
      let convId = conversationId;
      if (!convId) {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: content.slice(0, 60) }),
        });
        if (!res.ok) throw new Error('Could not start a conversation.');
        const conv = await res.json();
        convId = conv?.id as string;
        if (!convId) throw new Error('Could not start a conversation.');
        setConversationId(convId);
      }

      submitted = true;
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      });

      if ([401, 403, 404, 429].includes(res.status)) submitted = false;
      if (res.status === 409) {
        throw new Error('This request was not admitted by the spend policy.');
      }
      if (!res.ok || !res.body) {
        throw new Error(res.status === 401 ? 'Sign in again to continue.' : res.status === 403 ? 'This conversation is not permitted.' : 'The request could not be completed. Check the conversation before sending again.');
      }

      setMessages((m) => [
        ...m,
        { id: assistantId, role: 'assistant', content: '', persona: activePersona, at: Date.now() },
      ]);

      let text = '';
      await readConversationStream(res.body, (chunk, respondingPersona) => {
        text += chunk;
        setMessages((m) => m.map((msg) => msg.id === assistantId ? {
          ...msg, content: text,
          persona: respondingPersona && respondingPersona in PERSONAS ? respondingPersona as PersonaType : msg.persona,
        } : msg));
      });

      setMessages((m) => m.map((msg) => msg.id === userMsg.id ? { ...msg, delivery: 'sent' } : msg));
      if (!text) {
        setMessages((m) => m.filter((msg) => msg.id !== assistantId));
        throw new Error('The model returned an empty answer.');
      }
    } catch (e) {
      setMessages((m) => m.filter((msg) => msg.id !== assistantId || msg.content.length > 0).map((msg) => msg.id === userMsg.id ? { ...msg, delivery: submitted ? 'unconfirmed' : 'unsent' } : msg));
      if (!submitted) setInput(content);
      setError(e instanceof Error ? e.message : 'Send failed.');
    } finally {
      try { await onComplete?.(); }
      catch { setError('Agent state could not be refreshed. Check your selection before continuing.'); }
      inFlight.current = false;
      setSending(false);
      onSendingChange?.(false);
      composer.current?.focus();
    }
  }, [activePersona, canSend, conversationId, input, onComplete, onSendingChange]);

  return (
    <div className="conversation-workspace" data-persona={activePersona ?? 'WHINK'}>
      <aside className="conversation-presence" aria-label="Executive presence">
        <p className="workspace-kicker">Your executive perspective</p>
        <div className="conversation-portrait"><Image src={activePersona === 'MAMBA' ? officialAssets.mamba : officialAssets.whink} alt={`${config?.name ?? 'WHINK'}, official portrait`} width={1122} height={1402} sizes="260px" priority /></div>
        <div className="conversation-presence-copy"><span className="workspace-kicker">{activePersona === 'MAMBA' ? 'Obsidian perspective' : 'Primary perspective'}</span><h2>{config?.name ?? 'Select an executive'}</h2><p>{config?.description ?? 'Agent state has not been confirmed.'}</p></div>
        <Link href={activePersona === 'MAMBA' ? '/dashboard/holo/obsidian' : '/dashboard/holo/presence'} className="workspace-text-link"><Orbit size={16} aria-hidden />Open immersive presence<ArrowUpRight size={14} aria-hidden /></Link>
        <div className="conversation-safeguards"><ShieldCheck size={17} aria-hidden /><p>Approval and spending controls stay in place in every conversation.</p></div>
      </aside>
      <div className="conversation-main">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 sm:px-8">
        <div>
          <label htmlFor="conversation-agent" className="mr-3 text-xs text-muted-foreground">Conversation agent</label>
          <select id="conversation-agent" aria-label="Conversation agent" value={activePersona ?? ''}
            disabled={sending || personaBusy} onChange={(event) => onPersonaChange(event.target.value as PersonaType)}
            className="min-h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground disabled:opacity-50">
            {!canConverse(activePersona) && <option value={activePersona ?? ''} disabled>Select an available agent</option>}
            <option value="WHINK">{PERSONAS.WHINK.name}</option>
            <option value="MAMBA">{PERSONAS.MAMBA.name}</option>
          </select>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline">{personaBusy ? 'Confirming selection…' : config?.shortTitle}</span>
      </div>

      {/* Messages */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
        <div className="mx-auto w-full max-w-[820px]">
          {messages.length === 0 && (
            <div className="conversation-welcome">
              <span className="conversation-welcome-icon"><MessageSquare size={24} aria-hidden /></span>
              <p className="workspace-kicker">{config?.name ?? 'Select an executive'} · {config?.title ?? 'Awaiting selection'}</p>
              <h1>{activePersona === 'MAMBA' ? 'Bring a plan. Find the blind spots.' : 'A clearer perspective starts here.'}</h1>
              <p className="conversation-welcome-description">{activePersona === 'MAMBA' ? 'Challenge an assumption, explore a risk, or pressure-test your next move.' : 'Make sense of the work in front of you. Start with what matters most.'}</p>
              <div className="conversation-prompts">{[
                'What changed in the last 24 hours?', 'Which opportunity is strongest this week?', 'Where is the biggest risk right now?',
              ].map(prompt => <button type="button" key={prompt} onClick={() => { setInput(prompt); composer.current?.focus(); }}><span>{prompt}</span><ArrowUpRight size={16} aria-hidden /></button>)}</div>
            </div>
          )}

          <div className="space-y-6">
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={m.role === 'user' ? 'flex justify-end' : ''}
              >
                <div className={m.role === 'user' ? 'max-w-[85%]' : 'max-w-[92%]'}>
                  <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    {m.role === 'user' ? 'You' : PERSONAS[m.persona].name} ·{' '}
                    <span className="tabular-nums">
                      {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </p>
                  {m.role === 'user' ? (
                    <div className="whitespace-pre-wrap break-words rounded-md bg-secondary px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                      {m.content}
                      {m.delivery && m.delivery !== 'sent' && <p className="mt-2 font-mono text-xs text-muted-foreground">{m.delivery === 'sending' ? 'Sending…' : m.delivery === 'unsent' ? 'Not sent · draft restored below' : 'Delivery unconfirmed · check history before sending again'}</p>}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap break-words border-l-2 border-[hsl(var(--whink-accent))] pl-3.5 text-sm leading-relaxed text-foreground">
                      {m.content || (
                        <span className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
                          <span className="h-1 w-1 animate-pulse rounded-full bg-[hsl(var(--whink-accent))]" />
                          thinking
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {(error || personaError) && (
            <p role="alert" className="mt-6 border-l-2 border-[hsl(var(--denial))] pl-3 font-mono text-xs text-[hsl(var(--denial))]">
              {error || personaError}
            </p>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="conversation-composer">
        <form
          className="conversation-composer-form"
          onSubmit={(e) => { e.preventDefault(); void send(); }}
        >
          <label htmlFor="composer" className="sr-only">
            Message {config?.name ?? 'an agent'}
          </label>
          <textarea
            id="composer"
            ref={composer}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={`Message ${config?.name ?? 'an agent'}`}
            disabled={sending || !canSend}
            className="conversation-input"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending || !canSend}
            className="conversation-send"
            aria-label={sending ? 'Sending message' : 'Send'}
          >
            <ArrowUp size={20} aria-hidden /><span className="sr-only">{sending ? 'Sending' : 'Send'}</span>
          </button>
        </form>
        <p className="mx-auto mt-2 w-full max-w-[820px] font-mono text-[11px] text-muted-foreground">
          Enter to send · Shift+Enter for a new line · Your approval and spending limits apply.
        </p>
      </div>
      </div>
    </div>
  );
}