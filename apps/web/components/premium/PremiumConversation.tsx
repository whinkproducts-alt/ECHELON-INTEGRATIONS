'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PERSONAS, ALL_PERSONAS, type PersonaType } from '@/lib/personas';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  persona: PersonaType;
  at: number;
};

/**
 * Conversation surface. Real send path: creates a conversation, posts the
 * message, and reads the SSE stream from /api/conversations/:id/messages.
 * Dense styling to match the operations shell; no cartoon chat chrome.
 */
export function PremiumConversation({
  activePersona,
  onPersonaChange,
}: {
  activePersona: PersonaType;
  onPersonaChange: (p: PersonaType) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const config = PERSONAS[activePersona];

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;
    setError(null);
    setSending(true);
    setInput('');
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
      persona: activePersona,
      at: Date.now(),
    };
    const assistantId = `a-${Date.now()}`;
    setMessages((m) => [...m, userMsg]);

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

      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (res.status === 409) {
        throw new Error('This request was not admitted by the spend policy.');
      }
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '');
        throw new Error(detail.slice(0, 200) || 'The model did not respond.');
      }

      setMessages((m) => [
        ...m,
        { id: assistantId, role: 'assistant', content: '', persona: activePersona, at: Date.now() },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const evt = JSON.parse(payload);
            if (evt?.type === 'text' && typeof evt.content === 'string') {
              text += evt.content;
              setMessages((m) =>
                m.map((msg) => (msg.id === assistantId ? { ...msg, content: text } : msg)),
              );
            } else if (evt?.type === 'error') {
              throw new Error(typeof evt.error === 'string' ? evt.error : 'The model returned an error.');
            }
          } catch {
            // Non-JSON SSE payloads are ignored; the stream continues.
          }
        }
      }

      if (!text) {
        setMessages((m) => m.filter((msg) => msg.id !== assistantId));
        throw new Error('The model returned an empty answer.');
      }
    } catch (e) {
      setMessages((m) => m.filter((msg) => msg.id !== assistantId));
      setError(e instanceof Error ? e.message : 'Send failed.');
    } finally {
      setSending(false);
      composer.current?.focus();
    }
  }, [activePersona, conversationId, input, sending]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Persona strip */}
      <div className="shrink-0 border-b border-border px-5 py-2.5 sm:px-8">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Agent">
          {ALL_PERSONAS.map((p) => {
            const c = PERSONAS[p];
            const active = p === activePersona;
            return (
              <button
                key={p}
                role="tab"
                aria-selected={active}
                onClick={() => onPersonaChange(p)}
                className={`whitespace-nowrap rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
                  active
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
        <div className="mx-auto w-full max-w-[820px]">
          {messages.length === 0 && (
            <div className="border-l-2 border-border pl-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {config.name} · {config.title}
              </p>
              <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">{config.description}</p>
              <ul className="mt-5 space-y-2">
                {[
                  'What changed in the last 24 hours?',
                  'Which opportunity is strongest this week?',
                  'Where is the biggest risk right now?',
                ].map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => { setInput(s); composer.current?.focus(); }}
                      className="font-mono text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
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
                    <div className="rounded-md bg-secondary px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                      {m.content}
                    </div>
                  ) : (
                    <div className="border-l-2 border-[hsl(var(--whink-accent))] pl-3.5 text-sm leading-relaxed text-foreground">
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

          {error && (
            <p className="mt-6 border-l-2 border-[hsl(var(--denial))] pl-3 font-mono text-xs text-[hsl(var(--denial))]">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border px-5 py-3 sm:px-8">
        <form
          className="mx-auto flex w-full max-w-[820px] items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); void send(); }}
        >
          <label htmlFor="composer" className="sr-only">
            Message {config.name}
          </label>
          <textarea
            id="composer"
            ref={composer}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={`Message ${config.name}`}
            disabled={sending}
            className="max-h-40 min-h-[40px] w-full resize-none rounded-md border border-border bg-secondary/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="h-10 shrink-0 rounded-md bg-primary px-4 font-mono text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {sending ? 'Sending' : 'Send'}
          </button>
        </form>
        <p className="mx-auto mt-2 w-full max-w-[820px] font-mono text-[11px] text-muted-foreground">
          Enter to send · Shift+Enter for a new line · answers route through Hermes and are admitted before transport
        </p>
      </div>
    </div>
  );
}