import { afterEach, describe, expect, it, vi } from 'vitest';
import { canConverse, dashboardJson, readConversationStream, readConversationEvents, isConversationPersona } from '../dashboard-client';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const stream = (...chunks: string[]) => new ReadableStream<Uint8Array>({ start(controller) {
  for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
  controller.close();
} });

describe('dashboard transport', () => {
  it('bounds a stalled read including body parsing and aborts its transport', async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn((_url, init) => {
      signal = init.signal;
      return Promise.resolve({ ok: true, json: () => new Promise(() => {}) });
    }));
    const pending = expect(dashboardJson('/api/projects')).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;
    expect(signal.aborted).toBe(true);
  });
  it('preserves caller cancellation and does not add read timeouts or retries to writes', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let signal!: AbortSignal;
    const fetcher = vi.fn((_url, init) => { signal = init.signal; return Promise.resolve(Response.json({ ok: true })); });
    vi.stubGlobal('fetch', fetcher);
    controller.abort();
    await dashboardJson('/api/projects', { signal: controller.signal });
    expect(signal.aborted).toBe(true);
    await dashboardJson('/api/persona/switch', { method: 'POST', signal: controller.signal });
    expect(signal).toBe(controller.signal);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([401, 403, 429, 500])('does not turn HTTP %i into empty data', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status })));
    await expect(dashboardJson('/api/projects')).rejects.toMatchObject({ status });
  });
  it('accepts an actual empty response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([])));
    await expect(dashboardJson('/api/projects')).resolves.toEqual([]);
  });
  it('does not infer backend support from directory membership', () => {
    expect(canConverse('WHINK')).toBe(true); expect(canConverse('MAMBA')).toBe(true);
    for (const p of ['AMARA', 'MATEO', 'PRIYA', 'SOREN', 'MEI_LING', 'MAYA', null]) expect(canConverse(p)).toBe(false);
  });
  it('decodes split SSE chunks, malformed lines and unterminated final text', async () => {
    const onText = vi.fn();
    await readConversationStream(stream('data: broken\n\ndata: {"type":"te', 'xt","content":"Hello","persona":"MAMBA"}\n\n', 'data: {"type":"text","content":" world"}'), onText);
    expect(onText.mock.calls).toEqual([['Hello', 'MAMBA'], [' world', undefined]]);
  });
  it('propagates a stream error after partial text', async () => {
    const onText = vi.fn();
    await expect(readConversationStream(stream('data: {"type":"text","content":"Partial"}\n\ndata: {"type":"error","error":"internal provider detail"}\n\n'), onText)).rejects.toThrow('interrupted');
    expect(onText).toHaveBeenCalledWith('Partial', undefined);
  });
  it('does not surface raw provider error details', async () => {
    await expect(readConversationStream(stream('data: {"type":"error","error":"secret provider detail"}'), vi.fn())).rejects.not.toThrow('secret');
  });
});

describe('canonical conversation event contract', () => {
  it('passes citations, tools, approvals and done events without treating them as text', async () => {
    const events = [{type:'citation',documentName:'Fixture.pdf',page:2},{type:'tool_call',tool:'fixture'},{type:'approval_required',approval:{id:'fixture'}},{type:'done',persona:'MAMBA',mambaMode:'OBSIDIAN'}];
    const received:unknown[]=[];
    await readConversationEvents(stream(...events.map(event => `data: ${JSON.stringify(event)}\n\n`)),event => received.push(event));
    expect(received).toEqual(events);
  });
  it('recognizes the backend conversation allowlist without enabling directory-only identities', () => {
    for(const identity of ['WHINK','MAMBA','PETER','PAUL','MICAH','NANDI','SCOUT','REGISTRATION']) expect(isConversationPersona(identity)).toBe(true);
    for(const identity of ['AMARA','MARCUS',null,'']) expect(isConversationPersona(identity)).toBe(false);
  });
});
