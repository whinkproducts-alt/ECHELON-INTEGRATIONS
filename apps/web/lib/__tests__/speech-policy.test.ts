import { describe,it,expect } from 'vitest';
import { readFileSync } from 'fs';
import { CaptureTurn } from '@/lib/capture-turn';
import { scheduledSpeechDay,transcriptAccepts,validatePcmWav,chooseHealthy,stableVoice,type SpeechResult } from '@/lib/speech-policy';
const healthy=(service:string,score:number)=>({ service,healthy:true,scoreMs:score }) as SpeechResult;
describe('speech schedule and evidence policy',()=> {
 it('runs5am local and catches yesterday before5 despite DST transitions',()=> {
  expect(scheduledSpeechDay(new Date('2026-11-01T10:59:00Z'),'America/Edmonton')).toBe('2026-10-31');
  expect(scheduledSpeechDay(new Date('2026-11-01T12:00:00Z'),'America/Edmonton')).toBe('2026-11-01');
  expect(scheduledSpeechDay(new Date('2026-03-08T11:00:00Z'),'America/Edmonton')).toBe('2026-03-08');
  expect(scheduledSpeechDay(new Date('2026-03-08T10:59:00Z'),'America/Edmonton')).toBe('2026-03-07');
 });
 it('rejects silence, unrelated and excessively inaccurate transcripts',()=> {
  expect(transcriptAccepts('The local speech service is ready for a clear voice test.')).toBe(true);
  expect(transcriptAccepts('The speech service is ready for a clear voice test')).toBe(true);
  expect(transcriptAccepts('')).toBe(false);expect(transcriptAccepts('hello how are you')).toBe(false);
 });
 it('validates actual owned speech fixture and rejects zero/invalid audio',()=> {
  const wav=readFileSync('public/speech/readiness.wav');expect(validatePcmWav(wav)).toBeCloseTo(3.58);
  expect(()=>validatePcmWav(new Uint8Array(44))).toThrow();
  const silent=Buffer.from(wav); // Preserve headers, zero only PCM samples.
  const data=silent.indexOf('data');silent.fill(0,data+8);
  expect(()=>validatePcmWav(silent)).toThrow('silent_audio');
 });
 it('retains comparable previous service but selects only healthy results',()=> {
  expect(chooseHealthy([healthy('whisper-kokoro',100),healthy('voicestudio',119)],'voicestudio')).toBe('voicestudio');
  expect(chooseHealthy([healthy('whisper-kokoro',100),healthy('voicestudio',121)],'voicestudio')).toBe('whisper-kokoro');
  expect(chooseHealthy([])).toBe(null);
 });
 it('assigns stable distinct primary voices and settles each capture once',async()=> {
  expect(stableVoice('whink',['a','b'])).toBe('a');expect(stableVoice('mamba',['a','b'])).toBe('b');
  expect(stableVoice('agent42',['a','b','c'])).toBe(stableVoice('agent42',['a','b','c']));
  const previous=new CaptureTurn(1);const next=new CaptureTurn(2);previous.complete('');previous.complete('stale');next.complete('new');
  expect(await previous.promise).toBe('');expect(await next.promise).toBe('new');
 });
});
