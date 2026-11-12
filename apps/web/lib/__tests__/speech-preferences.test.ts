import { beforeEach,describe,it,expect,vi } from 'vitest';
import type { NextRequest } from 'next/server';
const state=vi.hoisted(()=>({ row:{userId:'a',mode:'auto',voiceAssignments:{}} as any,queue:Promise.resolve(),queries:[] as unknown[] }));
const db=vi.hoisted(()=>({ $transaction:vi.fn(),speechDailyCheck:{findFirst:vi.fn(async()=>null)} }));
vi.mock('@/lib/db',()=>({prisma:db}));
vi.mock('@/auth',()=>({auth:vi.fn(async()=>({user:{id:'a'}}))}));
vi.mock('@/lib/safety/lockdown',()=>({isLockedDown:vi.fn(async()=>false)}));
vi.mock('@/lib/permission-engine',()=>({checkPermission:vi.fn(async()=>({allowed:true}))}));
vi.mock('@/lib/ledger',()=>({recordAction:vi.fn(async()=>({id:'ledger'}))}));
vi.mock('@/lib/speech-services',()=>({ speechSelectionEnabled:()=>true,speechContext:vi.fn(async()=>({pref:{userId:'a',mode:'auto',confirmedTimezone:'America/Edmonton',voiceAssignments:{}},timezone:'America/Edmonton',mode:'auto'})),speechTarget:()=>null,dailySpeech:vi.fn() }));
vi.mock('@/lib/speech-roster',()=>({isRosterSpeaker:vi.fn(async(id)=>['whink','mamba'].includes(id))}));
import { POST,GET } from '@/app/api/voice/config/route';
beforeEach(()=> {
 state.row={userId:'a',mode:'auto',voiceAssignments:{}};state.queue=Promise.resolve();state.queries=[];vi.clearAllMocks();
 db.$transaction.mockImplementation(async(fn:any)=> {
  const previous=state.queue;let release!:()=>void;state.queue=new Promise(resolve=>{release=resolve;});await previous;
  try{return await fn({$queryRaw:async(...args:any[])=>{state.queries.push(args);return[{id:'a'}];},speechPreference:{findUnique:async({where}:any)=>where.userId===state.row.userId?structuredClone(state.row):null,upsert:async({where,update}:any)=>{if(where.userId!=='a')throw new Error('wrong account');Object.assign(state.row,update);return state.row;}}});}finally{release();}
 });
});
const request=(speakerId:string,voice:string)=>new Request('http://local/api/voice/config',{method:'POST',body:JSON.stringify({speakerId,service:'whisper-kokoro',voice})}) as NextRequest;
describe('account voice assignment writes',()=> {
 it('serializes and merges concurrent distinct speaker edits; both successful saves survive',async()=>{
  const responses=await Promise.all([POST(request('whink','af_bella')),POST(request('mamba','am_michael'))]);
  expect(responses.map(response=>response.status)).toEqual([200,200]);
  expect(state.row.voiceAssignments['whisper-kokoro']).toEqual({whink:'af_bella',mamba:'am_michael'});
  expect(state.queries).toHaveLength(2);expect((state.queries[0] as any[])[1]).toBe('a');
 });
 it('hides lease internals and another account VoiceStudio catalog from public status',async()=>{
  db.speechDailyCheck.findFirst.mockResolvedValueOnce({status:'RUNNING',leaseToken:'internal-lease-secret',leaseExpiresAt:new Date(),results:[{service:'voicestudio',voices:['private-other-account-profile'],healthy:true}]} as any);
  const response=await GET();const text=JSON.stringify(await response.json());expect(text).not.toContain('internal-lease-secret');expect(text).not.toContain('private-other-account-profile');
 });
 it('rejects IDs outside the canonical roster without changing the account map',async()=>{
  expect((await POST(request('someone-elses-agent','af_bella'))).status).toBe(400);expect(db.$transaction).not.toHaveBeenCalled();
 });
});
