import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { isLoopbackUrl } from '@/lib/local-only';
import { runAdmittedVoice } from '@/lib/model-router/dispatch';
import { prisma } from '@/lib/db';
import { recordAction } from '@/lib/ledger';
import { checkPermission } from '@/lib/permission-engine';
import { isLockedDown } from '@/lib/safety/lockdown';
import { canonicalSpeaker, chooseHealthy, FIXTURE_TEXT, KOKORO_VOICES, scheduledSpeechDay, stableVoice, transcriptAccepts, validTimezone, validatePcmWav, type SpeechMode, type SpeechResult, type SpeechService } from './speech-policy';
export type { SpeechMode, SpeechResult, SpeechService } from './speech-policy';
export interface SpeechTarget { service: SpeechService; baseUrl: string; token: string; sttPath: string; ttsPath: string }
const SERVICES: SpeechService[] = ['whisper-kokoro', 'voicestudio'];
const LEASE_MS = 240_000;
const FIXTURE_SHA = '311ae4cfb832aff898ca19e56effb1e40d7ed6d6bd03ac70ac0bea2b9c2b6c9d';
export const speechSelectionEnabled = () => process.env.SPEECH_SELECTION_ENABLED === 'true';
export function speechTarget(service: SpeechService,userId:string): SpeechTarget | null {
  if (service==='voicestudio' && (!userId || process.env.VOICESTUDIO_ACCOUNT_USER_ID?.trim()!==userId)) return null;
  const baseUrl = (service === 'voicestudio' ? process.env.VOICESTUDIO_URL : process.env.LOCAL_SPEECH_URL)?.trim().replace(/\/$/, '');
  const token = (service === 'voicestudio' ? process.env.VOICESTUDIO_API_KEY : process.env.LOCAL_SPEECH_TOKEN)?.trim();
  if (!baseUrl || !isLoopbackUrl(baseUrl) || !token || token.length < (service === 'voicestudio' ? 16 : 32)) return null;
  const url = new URL(baseUrl);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
  return { service, baseUrl, token, sttPath: service === 'voicestudio' ? '/v1/audio/transcriptions' : '/audio/transcriptions', ttsPath: service === 'voicestudio' ? '/v1/audio/speech' : '/audio/speech' };
}
export async function speechContext(userId: string) {
  const [profile, pref] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId }, select: { timezone: true } }),
    prisma.speechPreference.findUnique({ where: { userId } }),
  ]);
  const timezone = profile?.timezone;
  return { pref, timezone: timezone && validTimezone(timezone) ? timezone : null, mode: (pref?.mode ?? 'legacy') as SpeechMode };
}
export async function boundedSpeechBody(response: Response, cap: number): Promise<Uint8Array> {
  if (!response.body) throw new Error('empty_response');
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > cap) throw new Error('response_too_large'); parts.push(value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  const out = new Uint8Array(size); let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
async function jsonProbe(target: SpeechTarget, path: string) {
  const response = await fetch(target.baseUrl + path, { redirect: 'error', headers: { Authorization: `Bearer ${target.token}` }, signal: AbortSignal.timeout(5000) });
  const data = JSON.parse(new TextDecoder().decode(await boundedSpeechBody(response, 65536)));
  return { response, data };
}
async function probe(userId: string, service: SpeechService, fixture: Uint8Array,automatic:boolean): Promise<SpeechResult> {
  const target = speechTarget(service,userId);
  const result: SpeechResult = { service, configured: !!target, reachable:false, modelReady:false, healthy:false, sampleCount:0, coldSttMs:null, warmSttMs:null, coldTtsMs:null, warmTtsMs:null, scoreMs:null, failure:null, version:null, voices:[] };
  if (!target) { result.failure = 'not_configured'; return result; }
  try {
    const eligible=async()=> { if(await isLockedDown(userId)) throw new Error('locked_down');if(automatic&&(await speechContext(userId)).mode!=='auto') throw new Error('manual_override'); };
    await eligible();
    if (await isLockedDown(userId)) throw new Error('locked_down');
    const discovery = await jsonProbe(target, service === 'voicestudio' ? '/.well-known/voicestudio-speech' : '/health');
    result.reachable = true;
    if (!discovery.response.ok) throw new Error('models_unavailable');
    if (service === 'voicestudio') {
      if (discovery.data.protocol !== 'voicestudio.speech.v1') throw new Error('unsupported_contract');
      result.version = typeof discovery.data.service_version === 'string' ? discovery.data.service_version.slice(0,64) : null;
      const catalog = await jsonProbe(target, '/v1/audio/voices');
      if (!catalog.response.ok) throw new Error('voice_catalog_unavailable');
      result.voices = (Array.isArray(catalog.data.voices) ? catalog.data.voices : []).filter((voice: { type?: string; voice_id?: unknown }) => voice.type === 'profile' && typeof voice.voice_id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(voice.voice_id)).map((voice: { voice_id: string }) => voice.voice_id).slice(0,100).sort();
    } else {
      if (discovery.data.ready !== true) throw new Error('models_unavailable');
      result.voices = KOKORO_VOICES;
    }
    const voice = result.voices[0] ?? 'alloy';
    for (let sample = 0; sample < 2; sample++) {
      await eligible();
      const form = new FormData(); form.append('file', new Blob([Uint8Array.from(fixture)], { type:'audio/wav' }), 'readiness.wav'); form.append('model','whisper-1');
      let started = performance.now();
      await runAdmittedVoice({ userId, channel:'stt', units:fixture.length, localEndpoint:target.baseUrl, provider:service }, async () => {
        await eligible();
        const response = await fetch(target.baseUrl + target.sttPath, { method:'POST', redirect:'error', headers:{ Authorization:`Bearer ${target.token}` }, body:form, signal:AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('stt_unavailable');
        const data = JSON.parse(new TextDecoder().decode(await boundedSpeechBody(response, 32768)));
        if (typeof data.text !== 'string' || !transcriptAccepts(data.text)) throw new Error('wrong_transcript');
      });
      const sttMs = Math.round(performance.now() - started); started = performance.now();
      await eligible();
      await runAdmittedVoice({ userId, channel:'tts', units:FIXTURE_TEXT.length, localEndpoint:target.baseUrl, provider:service }, async () => {
        await eligible();
        const response = await fetch(target.baseUrl + target.ttsPath, { method:'POST', redirect:'error', headers:{ Authorization:`Bearer ${target.token}`, 'Content-Type':'application/json' }, body:JSON.stringify({ model:service === 'voicestudio' ? 'tts-1' : 'kokoro', input:FIXTURE_TEXT, voice, response_format:'wav' }), signal:AbortSignal.timeout(15000) });
        if (!response.ok || !['audio/wav','audio/x-wav'].includes(response.headers.get('content-type')?.split(';')[0] ?? '')) throw new Error('tts_unavailable');
        validatePcmWav(await boundedSpeechBody(response, 6*1024*1024));
      });
      const ttsMs = Math.round(performance.now() - started);
      await eligible();
      if (sample === 0) { result.coldSttMs=sttMs; result.coldTtsMs=ttsMs; } else { result.warmSttMs=sttMs; result.warmTtsMs=ttsMs; }
      result.sampleCount++;
    }
    result.modelReady=true; result.healthy=true;
    // Score excludes first-use cost; both cold/first and warmed sample timings remain visible.
    result.scoreMs = result.warmSttMs! + result.warmTtsMs!;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    result.failure = ['locked_down','manual_override','models_unavailable','unsupported_contract','voice_catalog_unavailable','stt_unavailable','wrong_transcript','tts_unavailable','invalid_audio','unsupported_audio','invalid_audio_duration','silent_audio'].includes(message) ? message : 'connection_timeout_or_inference_failure';
  }
  return result;
}
export async function dailySpeech(userId: string, now = new Date(), force = false) {
  const context = await speechContext(userId);
  if (!force&&context.mode!=='auto') throw new Error('Automatic checks are disabled by the manual speech choice.');
  if (!context.timezone || context.pref?.confirmedTimezone !== context.timezone) throw new Error('Confirm your profile timezone in speech settings first.');
  if (await isLockedDown(userId)) throw new Error('Speech checks are stopped by lockdown.');
  const permission = await checkPermission(userId,'speech_health_check','A');
  if (!permission.allowed) throw new Error('Speech health checks are not permitted.');
  const key = { userId, timezone:context.timezone, scheduledDay:scheduledSpeechDay(now,context.timezone) };
  const where = { userId_timezone_scheduledDay:key };
  await prisma.speechDailyCheck.upsert({ where, create:key, update:{} });
  const current = await prisma.speechDailyCheck.findUniqueOrThrow({ where });
  if (current.status === 'COMPLETED' && (!force || (current.checkedAt && now.getTime()-current.checkedAt.getTime()<60000))) return current;
  const leaseToken = randomUUID();
  const claim = await prisma.speechDailyCheck.updateMany({ where:{ ...key, ...(force ? {} : { status:{ not:'COMPLETED' } }), OR:[{ leaseExpiresAt:null },{ leaseExpiresAt:{ lte:now } }] }, data:{ status:'RUNNING',leaseToken,leaseExpiresAt:new Date(now.getTime()+LEASE_MS) } });
  if (claim.count !== 1) return current; // Another process owns the bounded lease.
  try {
    const fixture = await readFile(join(process.cwd(),'public/speech/readiness.wav'));
    if (createHash('sha256').update(fixture).digest('hex') !== FIXTURE_SHA) throw new Error('fixture_integrity_failure');
    validatePcmWav(fixture);
    const results:SpeechResult[]=[];
    // Sequential services avoid warming competing model engines together on the 16GB target.
    for (const service of SERVICES) results.push(await probe(userId,service,fixture,!force));
    const selected = chooseHealthy(results,context.pref?.selectedService);
    const reason = selected ? 'Healthy pair chosen by warmed STT+TTS milliseconds; previous healthy pair retained within 20%.' : 'Neither pair passed known-speech recognition and playable speech synthesis. Text remains available.';
    // Only the live lease holder may finalize. A crashed/stale worker cannot overwrite a replacement.
    const finalized = await prisma.speechDailyCheck.updateMany({ where:{ ...key,leaseToken,leaseExpiresAt:{ gt:new Date() } },data:{ status:'COMPLETED',checkedAt:new Date(),selected,results:JSON.parse(JSON.stringify(results)),reason,leaseToken:null,leaseExpiresAt:null } });
    if (finalized.count === 1) {
      await prisma.speechPreference.updateMany({ where:{ userId,mode:'auto' },data:{ selectedService:selected } });
      await recordAction({ userId,action:'speech_daily_check',permissionClass:'A',status:selected?'EXECUTED':'UNVERIFIED',initiator:'system',inputSummary:'Two bounded synthetic STT+TTS samples per configured local service; no user audio.',outputSummary:JSON.stringify({ scheduledDay:key.scheduledDay,timezone:key.timezone,selected,results }) });
    }
  } catch {
    await prisma.speechDailyCheck.updateMany({ where:{ ...key,leaseToken },data:{ status:'COMPLETED',checkedAt:new Date(),selected:null,reason:'Readiness fixture, policy, or persistence unavailable; speech not verified.',leaseToken:null,leaseExpiresAt:null } });
  }
  return prisma.speechDailyCheck.findUniqueOrThrow({ where });
}
/** Global worker discovery is bounded; every subsequent operation uses that row's account ID. */
export async function runDueSpeechChecks(now = new Date(), limit = 10): Promise<number> {
  if (!speechSelectionEnabled()) return 0;
  const accounts = await prisma.speechPreference.findMany({ where:{ mode:'auto',confirmedTimezone:{ not:null } },select:{ userId:true },take:Math.min(100,Math.max(1,limit)),orderBy:{ updatedAt:'asc' } });
  let completed=0;
  for (const account of accounts) { try { await prisma.speechPreference.updateMany({ where:{ userId:account.userId,mode:'auto' },data:{ updatedAt:now } }); const result=await dailySpeech(account.userId,now); if (result.status==='COMPLETED') completed++; } catch { /* Lockdown and unavailable configuration do not stop other accounts. */ } }
  return completed;
}
function turnSecret(): string {
  const secret=process.env.AUTH_SECRET?.trim(); if (!secret || secret.length<32) throw new Error('Speech turn signing unavailable'); return secret;
}
export function signSpeechTurn(userId: string,service: SpeechService): string {
  const payload=Buffer.from(JSON.stringify({ userId,service,expiresAt:Date.now()+10*60000,nonce:randomUUID() })).toString('base64url');
  return payload+'.'+createHmac('sha256',turnSecret()).update(payload).digest('base64url');
}
export function verifySpeechTurn(token: string,userId: string): SpeechService {
  const [payload,signature,...extra]=token.split('.'); if (!payload || !signature || extra.length || token.length>1024) throw new Error('Invalid speech turn');
  const expected=createHmac('sha256',turnSecret()).update(payload).digest(); const actual=Buffer.from(signature,'base64url');
  if (actual.length!==expected.length || !timingSafeEqual(actual,expected)) throw new Error('Invalid speech turn');
  const value=JSON.parse(Buffer.from(payload,'base64url').toString());
  if (value.userId!==userId || !SERVICES.includes(value.service) || !Number.isFinite(value.expiresAt) || value.expiresAt<Date.now()) throw new Error('Expired or wrong-account speech turn');
  return value.service;
}
export async function selectedSpeech(request: Request,userId: string): Promise<SpeechTarget|null|undefined> {
  if (!speechSelectionEnabled()) return undefined;
  const token=request.headers.get('x-speech-turn');
  if (token) return speechTarget(verifySpeechTurn(token,userId),userId);
  const { mode }=await speechContext(userId);
  if (mode==='legacy') return undefined;
  if (mode!=='auto') return speechTarget(mode,userId);
  const daily=await dailySpeech(userId);
  return daily.status==='COMPLETED' && SERVICES.includes(daily.selected as SpeechService) ? speechTarget(daily.selected as SpeechService,userId) : null;
}
export async function voiceForSpeaker(userId: string,service: SpeechService,speaker: unknown): Promise<{voice:string;notice:string|null}> {
  if (!speechTarget(service,userId)) throw new Error('Speech service not configured for this account');
  const context=await speechContext(userId); const id=canonicalSpeaker(speaker);
  const assignments=context.pref?.voiceAssignments;
  const map = assignments && typeof assignments==='object' && !Array.isArray(assignments) ? assignments as Record<string,unknown> : {};
  const serviceMap = map[service] && typeof map[service]==='object' ? map[service] as Record<string,unknown> : {};
  const latest=await prisma.speechDailyCheck.findFirst({ where:{ userId,status:'COMPLETED' },orderBy:{ checkedAt:'desc' } });
  const results=Array.isArray(latest?.results) ? latest.results as unknown as SpeechResult[] : [];
  const catalog = service==='whisper-kokoro' ? KOKORO_VOICES : results.find(result=>result.service===service)?.voices ?? [];
  const assigned=serviceMap[id];
  if (typeof assigned==='string' && catalog.includes(assigned)) return {voice:assigned,notice:null};
  // VoiceStudio aliases all resolve to one default; never pretend they are distinct agent voices.
  return {voice:catalog.length ? stableVoice(id,catalog) : 'alloy',notice:typeof assigned==='string'?'stored_voice_unavailable':service==='voicestudio'&&!catalog.length?'distinct_voice_profiles_unavailable':null};
}
