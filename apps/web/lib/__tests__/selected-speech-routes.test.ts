import { describe,it,expect,vi,beforeEach,afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
const state=vi.hoisted(()=>({ locked:false,selected:{service:'voicestudio',baseUrl:'http://127.0.0.1:8766',token:'not-an-actual-secret',sttPath:'/v1/audio/transcriptions',ttsPath:'/v1/audio/speech'} as any }));
vi.mock('@/auth',()=>({auth:vi.fn(async()=>({user:{id:'owner'}}))}));
vi.mock('@/lib/safety/lockdown',()=>({isLockedDown:vi.fn(async()=>state.locked),ledgerLockdownBlock:vi.fn(),LOCKDOWN_MESSAGE:'Locked'}));
vi.mock('@/lib/speech-services',async()=> {
 const actual=await vi.importActual<any>('@/lib/speech-services');
 return {...actual,selectedSpeech:vi.fn(async()=>state.selected),voiceForSpeaker:vi.fn(async(_id,_service,speaker)=>({voice:speaker==='mamba'?'private-mamba':'private-whink',notice:null})),signSpeechTurn:vi.fn(()=> 'signed-account-pin')};
});
vi.mock('@/lib/model-router/dispatch',()=>({runAdmittedVoice:vi.fn(async(_input,run)=>run()),DispatchBlockedError:class extends Error{}}));
const fetchMock=vi.fn();
beforeEach(()=>{state.locked=false;vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();});
afterEach(()=>vi.unstubAllGlobals());
describe('selected account-bound speech routes',()=> {
 it('uses verified VoiceStudio recognition endpoint with signed pin and no ASR confidence',async()=>{
  fetchMock.mockResolvedValue(Response.json({text:'hello',confidence:1}));
  const {POST}=await import('@/app/api/voice/stt/route');const form=new FormData();form.append('audio',new Blob(['RIFF'],{type:'audio/wav'}),'record.wav');
  const response=await POST(new Request('http://local/api/voice/stt',{method:'POST',headers:{'content-length':'256','x-speech-turn':'existing-pin'},body:form}) as NextRequest);
  expect(await response.json()).toEqual({text:'hello',service:'voicestudio',turnToken:'signed-account-pin'});
  expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8766/v1/audio/transcriptions');
  expect(fetchMock.mock.calls[0][1]).toMatchObject({redirect:'error',headers:{Authorization:'Bearer not-an-actual-secret'}});
 });
 it('passes stable speaker mapping and returns genuine WAV MIME',async()=>{
  const bytes=new Uint8Array(46);bytes.set(new TextEncoder().encode('RIFF'),0);bytes.set(new TextEncoder().encode('WAVE'),8);
  fetchMock.mockResolvedValue(new Response(bytes,{headers:{'content-type':'audio/wav'}}));
  const {POST}=await import('@/app/api/voice/tts/route');
  const response=await POST(new Request('http://local/api/voice/tts',{method:'POST',body:JSON.stringify({text:'hello',speakerId:'mamba'})}) as NextRequest);
  expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('audio/wav');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({model:'tts-1',input:'hello',voice:'private-mamba',response_format:'wav'});
 });
 it('stops before dispatch if lockdown starts during selection or voice lookup',async()=>{
  const {selectedSpeech}=await import('@/lib/speech-services');vi.mocked(selectedSpeech).mockImplementationOnce(async()=>{state.locked=true;return state.selected;});
  const {POST}=await import('@/app/api/voice/stt/route');const form=new FormData();form.append('audio',new Blob(['RIFF']),'record.wav');
  const response=await POST(new Request('http://local/api/voice/stt',{method:'POST',headers:{'content-length':'256'},body:form}) as NextRequest);
  expect(response.status).toBe(503);expect(fetchMock).not.toHaveBeenCalled();
 });
});
