/** Low-level provider transport. Only dispatch.ts may invoke it in application code. No automatic retries. */
import { HIGGSFIELD_ORIGIN } from './config';
import { providerRequest, mediaInputSchema, type MediaInput } from './schema';
import { z } from 'zod';
import { usdToMicros } from './quote';
const outputUrl = z.string().url().refine((raw) => { const u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password; });
const resultSchema = z.object({
  request_id: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  status: z.enum(['queued', 'in_progress', 'processing', 'completed', 'failed', 'canceled', 'nsfw']),
  expires_at: z.string().optional(),
  images: z.array(z.object({ url: outputUrl })).max(10).optional(),
  video: z.object({ url: outputUrl }).optional(),
});
export class HiggsfieldClient {
  constructor(private credentials: { keyId: string; secret: string }, private transport: typeof fetch = fetch) {}
  private async request(path: string, init: RequestInit) {
    let response: Response;
    try {
      response = await this.transport(`${HIGGSFIELD_ORIGIN}/${path}`, {
        ...init, headers: { ...init.headers, Authorization: `Key ${this.credentials.keyId}:${this.credentials.secret}`, 'Content-Type': 'application/json' },
        redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000),
      });
    } catch { throw new Error('HIGGSFIELD_TRANSPORT_FAILED'); }
    // Never return provider error text: it may echo credentials, private prompts or signed URLs.
    if (!response.ok) throw new Error(`HIGGSFIELD_HTTP_${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('HIGGSFIELD_INVALID_RESPONSE');
    let text = ''; let bytes = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 64 * 1024) { await reader.cancel(); throw new Error('HIGGSFIELD_RESPONSE_TOO_LARGE'); }
      text += decoder.decode(value, { stream: true });
    }
    try { return JSON.parse(text + decoder.decode()) as unknown; }
    catch { throw new Error('HIGGSFIELD_INVALID_RESPONSE'); }
  }
  async estimate(input: MediaInput) {
    const request = providerRequest(mediaInputSchema.parse(input));
    const data = z.object({ usd: z.string() }).parse(await this.request(`estimate/${request.model}`, { method: 'POST', body: JSON.stringify(request.body) }));
    return { usd: data.usd, micros: usdToMicros(data.usd) };
  }
  async submit(input: MediaInput, attemptKey: string) {
    if (!/^[A-Za-z0-9:_-]{8,80}$/.test(attemptKey)) throw new Error('INVALID_ATTEMPT_KEY');
    const request = providerRequest(mediaInputSchema.parse(input));
    return resultSchema.parse(await this.request(request.model, { method: 'POST', headers: { 'Idempotency-Key': attemptKey }, body: JSON.stringify(request.body) }));
  }
  async status(requestId: string) {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(requestId)) throw new Error('INVALID_REQUEST_ID');
    return resultSchema.parse(await this.request(`requests/${requestId}/status`, { method: 'GET' }));
  }
}
