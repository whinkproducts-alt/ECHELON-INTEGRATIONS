'use client';
import { useCallback,useEffect,useState } from 'react';
import type { SpeechMode,SpeechResult,SpeechService } from '@/lib/speech-policy';
import { KOKORO_VOICES,stableVoice } from '@/lib/speech-policy';
interface Config {
 enabled:boolean;accountId:string;mode:SpeechMode;timezone:string|null;timezoneConfirmed:boolean;selectedService?:string|null;
 voiceAssignments:Record<string,Record<string,string>>;
 services:Array<{ service:SpeechService;configured:boolean }>;
 lastCheck:{ checkedAt:string|null;status:string;reason:string|null;results:SpeechResult[]|null }|null;
}
const names:Record<SpeechMode,string>={ auto:'Auto','whisper-kokoro':'Whisper + Kokoro',voicestudio:'VoiceStudio',legacy:'Previous provider' };
export function SpeechServicePanel() {
 const [config,setConfig]=useState<Config|null>(null);const [error,setError]=useState<string|null>(null);const [busy,setBusy]=useState(false);
 const [speaker,setSpeaker]=useState('whink');const [service,setService]=useState<SpeechService>('whisper-kokoro');const [voiceDraft,setVoiceDraft]=useState<{key:string;value:string}|null>(null);
 const load=useCallback(async()=> { const response=await fetch('/api/voice/config');const data=await response.json();if(!response.ok) throw new Error(data.error??'Speech settings unavailable.');setConfig(data);setVoiceDraft(null); },[]);
 useEffect(()=> { const controller=new AbortController();fetch('/api/voice/config',{ signal:controller.signal }).then(async response=> { const data=await response.json();if(!response.ok) throw new Error(data.error??'Speech settings unavailable.');if(!controller.signal.aborted) setConfig(data); }).catch(error=> { if(!controller.signal.aborted) setError(error.message); });return()=>controller.abort(); },[]);
 const save=async(body:Record<string,unknown>)=> {
  setBusy(true);setError(null);
  try { const response=await fetch('/api/voice/config',{ method:'POST',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(body) });const data=await response.json();if(!response.ok) throw new Error(data.error??'Could not save speech settings.');await load();window.dispatchEvent(new Event('speech-settings-changed')); }
  catch(error) { setError(error instanceof Error?error.message:'Speech settings unavailable.'); } finally { setBusy(false); }
 };
 if(!config) return <p role="status" className="text-sm text-muted-foreground">{error??'Loading speech services…'}</p>;
 if(!config.enabled) return <p className="text-sm text-muted-foreground">Selectable speech services are disabled in this installation. Your previous speech provider is unchanged.</p>;
 const results=config.lastCheck?.results??[];
 const voices=service==='whisper-kokoro'?KOKORO_VOICES:results.find(result=>result.service==='voicestudio')?.voices??[];
 const key=service+':'+speaker;const savedVoice=config.voiceAssignments?.[service]?.[speaker];
 const voice=voiceDraft?.key===key?voiceDraft.value:savedVoice??(voices.length?stableVoice(speaker,voices):'');
 return <div className="space-y-4">
  <p className="text-xs text-muted-foreground">Local setup account ID: <code className="select-all">{config.accountId}</code></p>
  <p className="text-sm text-muted-foreground">Choose listening and speech together. Changes apply on the next turn. Text stays available if speech fails.</p>
  <div role="group" aria-label="Speech service" className="flex flex-wrap gap-2">
   {(['auto','whisper-kokoro','voicestudio','legacy'] as SpeechMode[]).map(mode=><button key={mode} type="button" aria-pressed={config.mode===mode} disabled={busy||(mode==='auto'&&!config.timezone)} onClick={()=>void save({ mode,confirmTimezone:config.timezone })} className={`rounded-md border px-3 py-2 text-sm disabled:opacity-50 ${config.mode===mode?'border-primary bg-primary/10 text-foreground':'border-border text-muted-foreground hover:text-foreground'}`}>{names[mode]}</button>)}
  </div>
  <p className="text-xs text-muted-foreground">Daily Auto check: 5:00 a.m. in {config.timezone??'your profile timezone (set this first)'}. Selecting Auto confirms this timezone. A sleeping Mac checks when it next runs; manual choices stay selected.</p>
  <p className="text-sm">Selected: {names[config.selectedService as SpeechMode]??'Unavailable until a successful check'}</p>
  <div className="grid gap-3 md:grid-cols-2">
   {(['whisper-kokoro','voicestudio'] as SpeechService[]).map(id=> { const result=results.find(row=>row.service===id);const configured=config.services.find(row=>row.service===id)?.configured;return <div key={id} className="rounded-md border border-border bg-background/30 p-3 text-xs space-y-1">
    <h4 className="font-medium text-sm">{names[id]}</h4>
    <p>Configured: {configured?'yes':'no'} · Reachable: {result?(result.reachable?'yes':'no'):'not checked'}</p>
    <p>Models verified by speech test: {result?.healthy?'yes':'no'}</p>
    <p>Last successful test: {result?.healthy&&config.lastCheck?.checkedAt?new Date(config.lastCheck.checkedAt).toLocaleString():'none recorded'}</p>
    <p>Warm STT / TTS: {result?.warmSttMs??'—'} / {result?.warmTtsMs??'—'} ms · Samples: {result?.sampleCount??0}</p>
    <p>First-sample STT / TTS: {result?.coldSttMs??'—'} / {result?.coldTtsMs??'—'} ms</p>
    <p className="text-muted-foreground">{result?.failure??(result?.healthy?'Known phrase and playable WAV passed. Voice quality still needs your test.':'Runtime/models have not been verified.')}</p>
   </div>; })}
  </div>
  <button type="button" disabled={busy||!config.timezone} onClick={()=>void save({ test:true,confirmTimezone:config.timezone })} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">{busy?'Checking or saving…':'Check local services'}</button>
  <p className="text-xs text-muted-foreground">Checks use two short bundled synthetic samples per service, never your microphone or files. Warm score = STT + playable TTS milliseconds. Auto keeps yesterday’s healthy pair when within 20%.</p>
  {config.lastCheck?.reason&&<p className="text-xs text-muted-foreground">{config.lastCheck.reason}</p>}
  <fieldset disabled={busy} className="space-y-2 border-t border-border pt-3">
   <legend className="text-sm font-medium">Stable agent voices</legend>
   <div className="flex flex-wrap gap-2">
    <label className="text-xs">Agent ID<input aria-label="Agent ID" value={speaker} onChange={event=>setSpeaker(event.target.value.toLowerCase())} maxLength={100} className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" placeholder="whink, mamba, or agent ID"/></label>
    <label className="text-xs">Service<select aria-label="Voice service" value={service} onChange={event=>setService(event.target.value as SpeechService)} className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"><option value="whisper-kokoro">Whisper + Kokoro</option><option value="voicestudio">VoiceStudio</option></select></label>
    <label className="text-xs">Voice<select aria-label="Agent voice" value={voice} onChange={event=>setVoiceDraft({key,value:event.target.value})} className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">{voice&&!voices.includes(voice)&&<option value={voice}>{voice} (saved voice unavailable)</option>}{voices.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
   </div>
   {savedVoice&&!voices.includes(savedVoice)&&<p role="status" className="text-xs text-muted-foreground">Saved voice {savedVoice} is unavailable. Speech uses the service default until you choose an available voice.</p>}
   <button type="button" disabled={!voices.includes(voice)||!speaker} onClick={()=>void save({ speakerId:speaker,service,voice })} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">Save agent voice</button>
   <p className="text-xs text-muted-foreground">The primary and strategist personas have stable distinct Kokoro defaults. Other agents receive a stable mapping. VoiceStudio needs actual voice profiles for distinct voices; its OpenAI voice aliases all use the same engine default.</p>
  </fieldset>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </div>;
}
