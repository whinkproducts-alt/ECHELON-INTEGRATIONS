import { isLockedDown } from '@/lib/safety/lockdown';
import { runAdmittedVoice } from '@/lib/model-router/dispatch';
import { audioFilename } from './local-speech';
import { boundedSpeechBody, type SpeechTarget } from './speech-services';

export async function transcribeSpeech(userId:string,target:SpeechTarget,audio:Blob,signal?:AbortSignal):Promise<string> {
  const body=new FormData(); body.append('file',audio,audioFilename(audio.type)); body.append('model','whisper-1');
  return runAdmittedVoice({ userId,channel:'stt',units:audio.size,localEndpoint:target.baseUrl,provider:target.service },async()=> {
    if (await isLockedDown(userId)) throw new Error('Speech stopped by lockdown');
    const response=await fetch(target.baseUrl+target.sttPath,{ method:'POST',redirect:'error',headers:{ Authorization:`Bearer ${target.token}` },body,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error('Speech recognition unavailable');
    const data=JSON.parse(new TextDecoder().decode(await boundedSpeechBody(response,65536)));
    if (typeof data.text!=='string' || data.text.length>16000) throw new Error('Invalid transcription');
    if (await isLockedDown(userId)) throw new Error('Speech stopped by lockdown');
    return data.text;
  });
}
export async function synthesizeSpeech(userId:string,target:SpeechTarget,text:string,voice:string,signal?:AbortSignal):Promise<Uint8Array> {
  return runAdmittedVoice({ userId,channel:'tts',units:text.length,localEndpoint:target.baseUrl,provider:target.service },async()=> {
    if (await isLockedDown(userId)) throw new Error('Speech stopped by lockdown');
    const response=await fetch(target.baseUrl+target.ttsPath,{ method:'POST',redirect:'error',headers:{ Authorization:`Bearer ${target.token}`,'Content-Type':'application/json' },body:JSON.stringify({ model:target.service==='voicestudio'?'tts-1':'kokoro',input:text,voice,response_format:'wav' }),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000) });
    if (!response.ok || !['audio/wav','audio/x-wav'].includes(response.headers.get('content-type')?.split(';')[0]??'')) throw new Error('Speech synthesis unavailable');
    const audio=await boundedSpeechBody(response,16*1024*1024);
    // Basic real container check here; health probes perform duration/PCM/non-silence validation.
    if (audio.length<44 || new TextDecoder().decode(audio.subarray(0,4))!=='RIFF' || new TextDecoder().decode(audio.subarray(8,12))!=='WAVE') throw new Error('Invalid speech audio');
    if (await isLockedDown(userId)) throw new Error('Speech stopped by lockdown');
    return audio;
  });
}
