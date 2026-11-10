import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { readFileSync } from 'fs';
const state=vi.hoisted(()=>({ prefs:new Map<string,any>(),checks:new Map<string,any>(),locked:false,modeChange:false,requests:[] as string[],replaceLease:false }));
const key=(value:any)=>`${value.userId}:${value.timezone}:${value.scheduledDay}`;
const db=vi.hoisted(()=>({ userProfile:{ findUnique:vi.fn() },speechPreference:{ findUnique:vi.fn(),updateMany:vi.fn(),findMany:vi.fn() },speechDailyCheck:{ upsert:vi.fn(),findUniqueOrThrow:vi.fn(),findFirst:vi.fn(),updateMany:vi.fn() } }));
vi.mock('@/lib/db',()=>({ prisma:db }));
vi.mock('@/lib/ledger',()=>({ recordAction:vi.fn(async()=>({ id:'ledger' })) }));
vi.mock('@/lib/permission-engine',()=>({ checkPermission:vi.fn(async()=>({ allowed:true })) }));
vi.mock('@/lib/safety/lockdown',()=>({ isLockedDown:vi.fn(async()=>state.locked) }));
vi.mock('@/lib/model-router/dispatch',()=>({ runAdmittedVoice:vi.fn(async(_input,run)=>run()) }));
import { dailySpeech,selectedSpeech,speechTarget,signSpeechTurn,verifySpeechTurn,voiceForSpeaker } from '@/lib/speech-services';
beforeEach(()=> {
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-08T15:00:00Z'));vi.clearAllMocks();state.prefs.clear();state.checks.clear();state.locked=false;state.modeChange=false;state.requests=[];state.replaceLease=false;
 for(const userId of ['a','b'])state.prefs.set(userId,{ userId,mode:'auto',confirmedTimezone:'America/Edmonton',selectedService:'whisper-kokoro',voiceAssignments:{} });
 vi.stubEnv('SPEECH_SELECTION_ENABLED','true');vi.stubEnv('LOCAL_SPEECH_URL','http://127.0.0.1:8765');vi.stubEnv('LOCAL_SPEECH_TOKEN','x'.repeat(40));vi.stubEnv('VOICESTUDIO_URL','http://127.0.0.1:8766');vi.stubEnv('VOICESTUDIO_API_KEY','y'.repeat(40));vi.stubEnv('VOICESTUDIO_ACCOUNT_USER_ID','a');vi.stubEnv('AUTH_SECRET','z'.repeat(40));
 db.userProfile.findUnique.mockImplementation(async()=>({ timezone:'America/Edmonton' }));
 db.speechPreference.findUnique.mockImplementation(async({where}:any)=>({...state.prefs.get(where.userId)}));
 db.speechPreference.updateMany.mockImplementation(async({where,data}:any)=> {const p=state.prefs.get(where.userId);if(!p||(where.mode&&p.mode!==where.mode))return{count:0};Object.assign(p,data);return{count:1};});
 db.speechDailyCheck.upsert.mockImplementation(async({create}:any)=>{const k=key(create);if(!state.checks.has(k))state.checks.set(k,{...create,id:k,status:'PENDING',leaseToken:null,leaseExpiresAt:null,checkedAt:null,results:null});return{...state.checks.get(k)};});
 db.speechDailyCheck.findUniqueOrThrow.mockImplementation(async({where}:any)=>({...state.checks.get(key(where.userId_timezone_scheduledDay))}));
 db.speechDailyCheck.findFirst.mockImplementation(async({where}:any)=>[...state.checks.values()].find(c=>c.userId===where.userId)??null);
 db.speechDailyCheck.updateMany.mockImplementation(async({where,data}:any)=>{
  const row=state.checks.get(key(where));if(!row)return{count:0};
  if(where.leaseToken&&row.leaseToken!==where.leaseToken)return{count:0};
  if(where.status?.not===row.status)return{count:0};
  if(where.OR&&row.leaseExpiresAt&&row.leaseExpiresAt>new Date())return{count:0};
  if(where.leaseExpiresAt?.gt&&!(row.leaseExpiresAt>where.leaseExpiresAt.gt))return{count:0};
  Object.assign(row,data);return{count:1};
 });
 const wav=readFileSync('public/speech/readiness.wav');
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  state.requests.push(url);
  if(url.endsWith('/health'))return Response.json({ready:true});
  if(url.endsWith('/.well-known/voicestudio-speech'))return Response.json({protocol:'voicestudio.speech.v1',service_version:'checked'});
  if(url.endsWith('/v1/audio/voices'))return Response.json({voices:[{voice_id:'private-profile',type:'profile'},{voice_id:'alloy',type:'openai_alias'}]});
  if(url.endsWith('/audio/transcriptions')) {
   if(state.modeChange)state.prefs.get('a').mode='whisper-kokoro';
   if(state.replaceLease){const row=[...state.checks.values()][0];row.leaseToken='replacement';}
   return Response.json({text:'The local speech service is ready for a clear voice test'});
  }
  return new Response(wav,{headers:{'content-type':'audio/wav'}});
 }));
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('durable account-scoped speech coordinator',()=> {
 it('claims once across concurrent calls, persists actual two-sample evidence and reuses after restart',async()=>{
  const [first]=await Promise.all([dailySpeech('a'),dailySpeech('a')]);expect(first.status).toBe('COMPLETED');
  expect(state.requests.filter(url=>url.endsWith('/audio/transcriptions'))).toHaveLength(4);
  const before=state.requests.length;await dailySpeech('a');expect(state.requests).toHaveLength(before);
  const row=[...state.checks.values()][0];expect(row.results.every((r:any)=>r.healthy&&r.sampleCount===2)).toBe(true);
 });
 it('does not discover another account VoiceStudio profiles or destinations',async()=>{
  expect(speechTarget('voicestudio','b')).toBe(null);const row=await dailySpeech('b');
  expect(state.requests.some(url=>url.includes(':8766'))).toBe(false);
  expect((row.results as any[]).find(result=>result.service==='voicestudio').voices).toEqual([]);
 });
 it('refuses manual auto-check, and stops between STT and TTS after a manual override',async()=>{
  state.prefs.get('b').mode='whisper-kokoro';await expect(dailySpeech('b')).rejects.toThrow('manual');expect(state.requests).toHaveLength(0);
  state.modeChange=true;const row=await dailySpeech('a');expect(row.selected).toBe(null);expect(state.requests.some(url=>url.endsWith('/audio/speech'))).toBe(false);
  expect(state.prefs.get('a').mode).toBe('whisper-kokoro');
 });
 it('reclaims expired lease and refuses stale finalization after another worker takes over',async()=>{
  const k='a:America/Edmonton:2026-11-08';state.checks.set(k,{userId:'a',timezone:'America/Edmonton',scheduledDay:'2026-11-08',status:'RUNNING',leaseToken:'old',leaseExpiresAt:new Date(Date.now()-1)});
  state.replaceLease=true;await dailySpeech('a');expect(state.checks.get(k).leaseToken).toBe('replacement');expect(state.checks.get(k).status).toBe('RUNNING');
 });
 it('rejects wrong transcripts and lockdown without claiming inference success',async()=>{
  vi.mocked(fetch).mockImplementation(async()=>Response.json({ready:true,text:'silence'}));const row=await dailySpeech('a');expect(row.selected).toBe(null);
  state.locked=true;await expect(dailySpeech('b')).rejects.toThrow('lockdown');
 });
 it('reports a saved voice that vanished instead of silently pretending it was used',async()=>{
  state.prefs.get('a').voiceAssignments={'whisper-kokoro':{whink:'removed-voice'}};
  expect(await voiceForSpeaker('a','whisper-kokoro','whink')).toEqual({voice:'af_heart',notice:'stored_voice_unavailable'});
 });
 it('signs account-bound next-turn pins and rejects tampering, cross-account and expiry',async()=>{
  const token=signSpeechTurn('a','whisper-kokoro');expect(verifySpeechTurn(token,'a')).toBe('whisper-kokoro');
  expect(()=>verifySpeechTurn(token,'b')).toThrow();expect(()=>verifySpeechTurn(token+'x','a')).toThrow();
  state.prefs.get('a').mode='voicestudio';const selected=await selectedSpeech(new Request('http://local',{headers:{'x-speech-turn':token}}),'a');expect(selected?.service).toBe('whisper-kokoro');
  vi.setSystemTime(new Date(Date.now()+11*60000));expect(()=>verifySpeechTurn(token,'a')).toThrow();
 });
});
