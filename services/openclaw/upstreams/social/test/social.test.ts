import { describe, it, expect, vi, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer, handleCall, CREDENTIAL_META_KEY } from '../src/server.js';
import { TOOLS } from '../src/tools.js';

const TOKEN = 'tok_SECRET_abc123';
const CRED = JSON.stringify({ access_token: TOKEN, platform_user_id: '111' });
const names = (p: keyof typeof TOOLS) => TOOLS[p].map((t) => t.name);

afterEach(() => vi.unstubAllGlobals());

function mockFetch(status = 200, json: unknown = {}) {
  const f = vi.fn(async () => new Response(JSON.stringify(json), { status }));
  vi.stubGlobal('fetch', f);
  return f;
}
const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe('tool lists', () => {
  it('x', () => {
    expect(names('x')).toEqual(['read_home_timeline', 'read_mentions', 'read_dms', 'post', 'reply', 'send_dm', 'follow', 'unfollow', 'delete_post']);
  });
  it('instagram', () => {
    expect(names('instagram')).toEqual(['read_media', 'read_comments', 'publish_post', 'reply_comment']);
  });
  it('tiktok has no DM tools (D7)', () => {
    expect(names('tiktok')).toEqual(['read_videos', 'publish_video']);
    expect(names('tiktok').some((n) => /dm|message/.test(n))).toBe(false);
  });
  it('schemas are JSON Schema objects with limits, descriptions under 500 chars', () => {
    for (const t of TOOLS.x.concat(TOOLS.instagram, TOOLS.tiktok)) {
      expect(t.inputSchema.type).toBe('object');
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect(t.description.length).toBeLessThan(500);
    }
    const post = TOOLS.x.find((t) => t.name === 'post')!;
    expect((post.inputSchema.properties.text as { maxLength: number }).maxLength).toBe(280);
    const dm = TOOLS.x.find((t) => t.name === 'send_dm')!;
    expect((dm.inputSchema.properties.text as { maxLength: number }).maxLength).toBe(10000);
  });
  it('is served over MCP', async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await buildServer('tiktok').connect(b);
    const c = new Client({ name: 't', version: '0' }, { capabilities: {} });
    await c.connect(a);
    expect((await c.listTools()).tools.map((t) => t.name)).toEqual(['read_videos', 'publish_video']);
  });
});

describe('no credential', () => {
  it.each([['x', 'read_mentions'], ['x', 'post'], ['instagram', 'read_media'], ['tiktok', 'read_videos']] as const)(
    '%s %s returns not_connected with zero fetch calls',
    async (p, tool) => {
      const f = mockFetch();
      for (const cred of [undefined, '', 'not json', JSON.stringify({ access_token: '' }), 42]) {
        const r = await handleCall(p, tool, { text: 'hi' }, cred);
        expect(r.isError).toBe(true);
        expect(parse(r)).toEqual({ error: 'not_connected', platform: p });
      }
      expect(f).not.toHaveBeenCalled();
    },
  );
});

describe('skeletons with a credential', () => {
  it.each([['instagram', 'read_media'], ['instagram', 'publish_post'], ['tiktok', 'read_videos'], ['tiktok', 'publish_video']] as const)(
    '%s %s is not_implemented with zero fetch calls',
    async (p, tool) => {
      const f = mockFetch();
      const r = await handleCall(p, tool, {}, CRED);
      expect(r.isError).toBe(true);
      expect(parse(r)).toEqual({ error: 'not_implemented', platform: p, reason: 'pending platform app review' });
      expect(f).not.toHaveBeenCalled();
    },
  );
});

describe('X with a credential', () => {
  const call = (f: ReturnType<typeof mockFetch>) => {
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    return { url, init, headers: init.headers as Record<string, string> };
  };

  it('home timeline: URL, method, bearer, trimmed output', async () => {
    const f = mockFetch(200, { data: [{ id: '1', text: 'a', author_id: '9', created_at: 'now', conversation_id: '1', edit_history_tweet_ids: ['1'], secret: 'x' }], meta: { a: 1 } });
    const r = await handleCall('x', 'read_home_timeline', { max_results: 20 }, CRED);
    const c = call(f);
    expect(c.url.startsWith('https://api.x.com/2/users/111/timelines/reverse_chronological?')).toBe(true);
    expect(c.url).toContain('max_results=20');
    expect(c.init.method).toBe('GET');
    expect(c.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(parse(r)).toEqual({ posts: [{ id: '1', text: 'a', author_id: '9', created_at: 'now', conversation_id: '1' }] });
  });

  it('mentions and dms', async () => {
    let f = mockFetch(200, { data: [] });
    await handleCall('x', 'read_mentions', {}, CRED);
    expect(call(f).url).toContain('https://api.x.com/2/users/111/mentions?max_results=10');
    f = mockFetch(200, { data: [{ id: '5', text: 'hey', sender_id: '7', created_at: 't', dm_conversation_id: 'c', event_type: 'MessageCreate' }] });
    const r = await handleCall('x', 'read_dms', {}, CRED);
    expect(call(f).url.startsWith('https://api.x.com/2/dm_events?')).toBe(true);
    expect(parse(r)).toEqual({ messages: [{ id: '5', text: 'hey', sender_id: '7', created_at: 't' }] });
  });

  it('writes hit the right URL, method and body', async () => {
    let f = mockFetch(201, { data: { id: '2', text: 'yo' } });
    expect(parse(await handleCall('x', 'post', { text: 'yo' }, CRED))).toEqual({ id: '2', text: 'yo' });
    expect(call(f).url).toBe('https://api.x.com/2/tweets');
    expect(call(f).init.method).toBe('POST');
    expect(JSON.parse(call(f).init.body as string)).toEqual({ text: 'yo' });

    f = mockFetch(201, { data: { id: '3', text: 'r' } });
    await handleCall('x', 'reply', { in_reply_to_id: '42', text: 'r' }, CRED);
    expect(JSON.parse(call(f).init.body as string)).toEqual({ text: 'r', reply: { in_reply_to_tweet_id: '42' } });

    f = mockFetch(201, { data: { dm_event_id: 'e', dm_conversation_id: 'c' } });
    await handleCall('x', 'send_dm', { recipient_id: '77', text: 'hi' }, CRED);
    expect(call(f).url).toBe('https://api.x.com/2/dm_conversations/with/77/messages');
    expect(call(f).init.method).toBe('POST');

    f = mockFetch(200, { data: { following: true, pending_follow: false } });
    await handleCall('x', 'follow', { target_user_id: '88' }, CRED);
    expect(call(f).url).toBe('https://api.x.com/2/users/111/following');
    expect(JSON.parse(call(f).init.body as string)).toEqual({ target_user_id: '88' });

    f = mockFetch(200, { data: { following: false } });
    await handleCall('x', 'unfollow', { target_user_id: '88' }, CRED);
    expect(call(f).url).toBe('https://api.x.com/2/users/111/following/88');
    expect(call(f).init.method).toBe('DELETE');

    f = mockFetch(200, { data: { deleted: true } });
    expect(parse(await handleCall('x', 'delete_post', { post_id: '5' }, CRED))).toEqual({ deleted: true });
    expect(call(f).url).toBe('https://api.x.com/2/tweets/5');
    expect(call(f).init.method).toBe('DELETE');
  });

  it('rejects bad input without a network call', async () => {
    const f = mockFetch();
    const bad: [string, Record<string, unknown>][] = [
      ['post', { text: 'x'.repeat(281) }],
      ['post', { text: '' }],
      ['post', { text: 'ok', extra: 1 }],
      ['reply', { in_reply_to_id: '12/../x', text: 'a' }],
      ['send_dm', { recipient_id: 'abc', text: 'a' }],
      ['send_dm', { recipient_id: '1', text: 'x'.repeat(10001) }],
      ['follow', { target_user_id: '1'.repeat(20) }],
      ['unfollow', { target_user_id: '1?x=y' }],
      ['delete_post', { post_id: '../1' }],
      ['read_mentions', { max_results: 4 }],
      ['read_mentions', { max_results: 101 }],
    ];
    for (const [t, a] of bad) expect((await handleCall('x', t, a, CRED)).isError).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it('maps upstream errors without the body or token', async () => {
    mockFetch(429, { detail: 'SECRET-BODY', title: TOKEN });
    const r = await handleCall('x', 'read_mentions', {}, CRED);
    expect(r.isError).toBe(true);
    expect(parse(r)).toEqual({ error: 'platform_error', status: 429 });
    expect(JSON.stringify(r)).not.toContain('SECRET-BODY');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error(`boom ${TOKEN}`); }));
    const r2 = await handleCall('x', 'read_mentions', {}, CRED);
    expect(parse(r2)).toEqual({ error: 'platform_error', status: 0 });
    expect(JSON.stringify(r2)).not.toContain(TOKEN);
  });

  it('caps output size', async () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ id: String(i), text: 'z'.repeat(2000) }));
    mockFetch(200, { data });
    const r = await handleCall('x', 'read_home_timeline', { max_results: 100 }, CRED);
    expect(r.content[0].text.length).toBeLessThanOrEqual(32 * 1024);
    expect(parse(r).truncated).toBe(true);
  });

  it('X without platform_user_id is not_connected', async () => {
    const f = mockFetch();
    const r = await handleCall('x', 'read_mentions', {}, JSON.stringify({ access_token: TOKEN }));
    expect(parse(r).error).toBe('not_connected');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('credential read from request _meta over MCP', () => {
  it('uses dev.whink/credential and nothing else', async () => {
    const f = mockFetch(200, { data: [] });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await buildServer('x').connect(b);
    const c = new Client({ name: 't', version: '0' }, { capabilities: {} });
    await c.connect(a);
    const none = await c.callTool({ name: 'read_mentions', arguments: {} });
    expect(none.isError).toBe(true);
    expect(f).not.toHaveBeenCalled();
    const res = await c.callTool({ name: 'read_mentions', arguments: {}, _meta: { [CREDENTIAL_META_KEY]: CRED } });
    expect(res.isError).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
