'use client';
import { useState,useRef,useCallback,useEffect } from 'react';
import { CaptureTurn } from '@/lib/capture-turn';
import { recordingWav,recorderMime } from '@/lib/voice-audio';
import { acquireMicrophone } from './microphone-capture';
import { beginSpeech,endSpeech } from './speech-activity';
import { isClientLockedDown,onClientLockdown,trackMedia } from '@/lib/safety/client-lockdown';
import { createAnalyserFeed,type AudioFeed } from '@/components/avatar/avatar-audio-feed';
import { createVad } from '@/lib/voice-vad';

declare global { interface Window { SpeechRecognition:SpeechRecognitionConstructor; webkitSpeechRecognition:SpeechRecognitionConstructor } }
export interface VoiceSupport { stt:boolean;tts:boolean;serverStt:boolean }
export interface UseVoiceReturn {
  startListening:()=>void;stopListening:()=>Promise<string>;
  /** Hands-free: listen until the speaker stops, resolving with the transcript ('' when nothing was said). */
  listen:()=>Promise<string>;
  /** Cut the current reply off (barge-in). */
  stopSpeaking:()=>void;
  /** Call from a tap so the browser lets later captures run without a gesture. */
  primeAudio:()=>void;speak:(text:string,speakerId?:string)=>Promise<void>;
  isListening:boolean;isSpeaking:boolean;transcript:string;supported:VoiceSupport;lipSyncAmplitude:number;audioFeed:AudioFeed|null;voiceNotice?:string|null;
}
const LOCAL_ONLY_CLIENT=process.env.NEXT_PUBLIC_WHINK_LOCAL_ONLY==='true';
export const SPEECH_NOTICE='Speech is not available in Local-Only mode';
interface Turn { mode:'local'|'legacy';serverStt:boolean;turnToken?:string }
export function useVoice(options:{ speakerId?:string }={}):UseVoiceReturn {
  const [isListening,setIsListening]=useState(false);const [isSpeaking,setIsSpeaking]=useState(false);
  const [transcript,setTranscript]=useState('');const [voiceNotice,setVoiceNotice]=useState<string|null>(null);
  const [lipSyncAmplitude,setLipSyncAmplitude]=useState(0);const [audioFeed,setAudioFeed]=useState<AudioFeed|null>(null);
  const [supported,setSupported]=useState<VoiceSupport>({ stt:false,tts:false,serverStt:true });
  const mounted=useRef(true);const captureEpoch=useRef(0);const playbackEpoch=useRef(0);const intent=useRef(false);
  const recorder=useRef<MediaRecorder|null>(null);const recognition=useRef<SpeechRecognition|null>(null);
  const capturedText=useRef('');const turn=useRef<Turn|null>(null);const captureAbort=useRef<AbortController|null>(null);
  const playbackAbort=useRef<AbortController|null>(null);const pendingCapture=useRef<CaptureTurn|null>(null);
  const playbackResolve=useRef<(()=>void)|null>(null);const audio=useRef<HTMLAudioElement|null>(null);
  const audioUrl=useRef<string|null>(null);const context=useRef<AudioContext|null>(null);const animation=useRef<number|null>(null);
  const captureTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const speaker=useRef(options.speakerId??'whink');
  const autoStop=useRef(false);const vadContext=useRef<AudioContext|null>(null);
  useEffect(()=> { speaker.current=options.speakerId??'whink'; },[options.speakerId]);

  const finishCapture=useCallback((text:string,version=captureEpoch.current)=> { if(version===captureEpoch.current) capturedText.current=text;if(pendingCapture.current?.version===version) pendingCapture.current.complete(text); },[]);
  const stopMotion=useCallback(()=> {
    if (animation.current!==null) cancelAnimationFrame(animation.current);animation.current=null;
    if (mounted.current) { setAudioFeed(null);setLipSyncAmplitude(0); }
  },[]);
  const stopPlayback=useCallback(()=> {
    playbackEpoch.current++;playbackAbort.current?.abort();playbackAbort.current=null;
    try { audio.current?.pause(); } catch { /* already stopped */ } audio.current=null;
    playbackResolve.current?.();playbackResolve.current=null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);audioUrl.current=null;
    if (context.current && context.current.state!=='closed') void context.current.close().catch(()=>{});context.current=null;
    if (typeof window!=='undefined') window.speechSynthesis?.cancel();
    stopMotion();if (mounted.current) setIsSpeaking(false);
  },[stopMotion]);
  const cancelCapture=useCallback(()=> {
    pendingCapture.current?.complete('');captureEpoch.current++;intent.current=false;captureAbort.current?.abort();captureAbort.current=null;
    if (captureTimer.current) clearTimeout(captureTimer.current);captureTimer.current=null;
    try { recognition.current?.abort(); } catch { /* already stopped */ } recognition.current=null;
    if (recorder.current) {
      recorder.current.onstop=null;
      try { if (recorder.current.state!=='inactive') recorder.current.stop(); } catch { /* already stopped */ }
      recorder.current.stream.getTracks().forEach(track=>track.stop());recorder.current=null;
    }
    finishCapture('');turn.current=null;if (mounted.current) setIsListening(false);
  },[finishCapture]);
  useEffect(()=> {
    mounted.current=true;
    const timer=setTimeout(()=>setSupported({ stt:typeof MediaRecorder!=='undefined'||(!LOCAL_ONLY_CLIENT&&!!(window.SpeechRecognition??window.webkitSpeechRecognition)),tts:true,serverStt:true }),0);
    return ()=> { mounted.current=false;clearTimeout(timer);cancelCapture();stopPlayback();void vadContext.current?.close().catch(()=>{});vadContext.current=null; };
  },[cancelCapture,stopPlayback]);
  useEffect(()=>onClientLockdown(locked=> { if (locked) { cancelCapture();stopPlayback(); } }),[cancelCapture,stopPlayback]);

  const fetchTurn=useCallback(async(controller:AbortController):Promise<Turn>=> {
    const response=await fetch('/api/voice/session',{ method:'POST',signal:controller.signal });
    const value=await response.json();
    if (!response.ok) throw new Error(typeof value.error==='string'?value.error:'Speech is unavailable.');
    if (value.mode==='local' && typeof value.turnToken==='string') return { mode:'local',serverStt:true,turnToken:value.turnToken };
    if (value.mode==='legacy') return { mode:'legacy',serverStt:LOCAL_ONLY_CLIENT||value.serverStt===true };
    throw new Error('Invalid speech configuration');
  },[]);

  const startListening=useCallback(()=> {
    if (intent.current||isListening||isClientLockedDown()) return;
    pendingCapture.current?.complete('');if(captureTimer.current) clearTimeout(captureTimer.current);captureTimer.current=null;recorder.current=null;intent.current=true;const version=++captureEpoch.current;pendingCapture.current=new CaptureTurn(version);capturedText.current='';turn.current=null;
    const auto=autoStop.current;autoStop.current=false;
    captureAbort.current?.abort();const controller=new AbortController();captureAbort.current=controller;
    setVoiceNotice('Checking speech service…');
    const active=()=>mounted.current&&intent.current&&version===captureEpoch.current&&!controller.signal.aborted&&!isClientLockedDown();
    void (async()=> {
      const selected=await fetchTurn(controller);if (!active()) return;turn.current=selected;setVoiceNotice(null);
      const BrowserRecognition=selected.mode==='legacy'&&!selected.serverStt&&!LOCAL_ONLY_CLIENT?(window.SpeechRecognition??window.webkitSpeechRecognition):null;
      if (BrowserRecognition) {
        const recognizer=new BrowserRecognition();recognition.current=recognizer;recognizer.continuous=true;recognizer.interimResults=true;recognizer.lang='en-US';
        let silenceTimer:ReturnType<typeof setTimeout>|null=null;
        const armSilence=(ms:number)=> { if(silenceTimer) clearTimeout(silenceTimer);silenceTimer=setTimeout(()=> { try { recognizer.stop(); } catch { /* already stopped */ } },ms); };
        recognizer.onresult=event=> {
          if (!mounted.current||version!==captureEpoch.current||isClientLockedDown()) return;
          let interim='';for (let i=event.resultIndex;i<event.results.length;i++) { if (event.results[i].isFinal) capturedText.current+=event.results[i][0].transcript;else interim+=event.results[i][0].transcript; }
          setTranscript(capturedText.current+interim);
          if(auto) armSilence(1500);
        };
        const complete=()=> { if(silenceTimer) clearTimeout(silenceTimer);if(version!==captureEpoch.current) return;intent.current=false;if (mounted.current) setIsListening(false);finishCapture(capturedText.current,version); };
        recognizer.onend=complete;recognizer.onerror=complete;recognizer.start();setIsListening(true);if(auto) armSilence(9000);setSupported(previous=>({...previous,serverStt:false}));return;
      }
      const stream=await acquireMicrophone(()=>navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true,noiseSuppression:true } }),active);
      if (!stream) return;trackMedia(stream);
      const mime=recorderMime();let recording:MediaRecorder;
      try { recording=new MediaRecorder(stream,mime?{ mimeType:mime }:undefined); } catch(error) { stream.getTracks().forEach(track=>track.stop());throw error; }
      const chunks:Blob[]=[];let size=0;recorder.current=recording;let silent=false;
      recording.ondataavailable=event=> { size+=event.data.size;if (size<=10*1024*1024&&event.data.size) chunks.push(event.data);else if (recording.state!=='inactive') recording.stop(); };
      recording.onstop=()=> {
        stream.getTracks().forEach(track=>track.stop());
        if(version!==captureEpoch.current||!mounted.current) return;
        intent.current=false;if (captureTimer.current) clearTimeout(captureTimer.current);captureTimer.current=null;
        stream.getTracks().forEach(track=>track.stop());if (mounted.current) setIsListening(false);
        void (async()=> {
          let text='';
          try {
            if (silent) return; // hands-free heard nothing: do not send silence to speech recognition
            const wav=await recordingWav(new Blob(chunks,{ type:recording.mimeType }));
            if (!mounted.current||version!==captureEpoch.current||controller.signal.aborted||isClientLockedDown()) return;
            const form=new FormData();form.append('audio',wav,'audio.wav');
            const response=await fetch('/api/voice/stt',{ method:'POST',headers:selected.turnToken?{ 'X-Speech-Turn':selected.turnToken }:{},body:form,signal:controller.signal });
            const value=await response.json();
            if (!mounted.current||version!==captureEpoch.current||controller.signal.aborted||isClientLockedDown()) return;
            if (!response.ok) throw new Error(value.error??'Speech recognition unavailable.');
            text=typeof value.text==='string'?value.text:'';
            if (typeof value.turnToken==='string') turn.current={...selected,turnToken:value.turnToken};
            setTranscript(text);
          } catch(error) { if (mounted.current&&!controller.signal.aborted) setVoiceNotice(error instanceof Error?error.message:'Recording unavailable.'); }
          finally { if (version===captureEpoch.current) finishCapture(text); }
        })();
      };
      recording.start(1000);setIsListening(true);setSupported(previous=>({...previous,serverStt:true}));
      if (auto) {
        const Ctx=window.AudioContext??(window as unknown as { webkitAudioContext?:typeof AudioContext }).webkitAudioContext;
        const ctx=vadContext.current&&vadContext.current.state!=='closed'?vadContext.current:Ctx?new Ctx():null;
        if (ctx) {
          void ctx.resume().catch(()=>{});
          const analyser=ctx.createAnalyser();analyser.fftSize=1024;const source=ctx.createMediaStreamSource(stream);source.connect(analyser);
          const samples=new Uint8Array(analyser.fftSize);const verdictFor=createVad(Date.now());
          const release=()=> { clearInterval(watch);try { source.disconnect(); } catch { /* already gone */ } if(ctx!==vadContext.current) void ctx.close().catch(()=>{}); };
          const watch=setInterval(()=> {
            if (recording.state==='inactive'||version!==captureEpoch.current) { release();return; }
            analyser.getByteTimeDomainData(samples);let sum=0;for (const sample of samples) { const v=(sample-128)/128;sum+=v*v; }
            const verdict=verdictFor(Math.sqrt(sum/samples.length),Date.now());
            if (verdict==='unreadable') release(); // leave ending the turn to the user
            else if (verdict==='end'||verdict==='no-speech') { silent=verdict==='no-speech';release();try { recording.stop(); } catch { /* already stopped */ } }
          },100);
        }
      }
      captureTimer.current=setTimeout(()=> { if(recording.state!=='inactive') recording.stop(); },60000);
    })().catch(error=> {
      if (version===captureEpoch.current) { intent.current=false;finishCapture('');if(mounted.current&&!controller.signal.aborted) setVoiceNotice(error instanceof Error?error.message:'Microphone unavailable.'); }
    });
  },[fetchTurn,finishCapture,isListening]);

  const stopListening=useCallback(():Promise<string>=> {
    intent.current=false;
    if (recorder.current) {
      if (recorder.current.state!=='inactive') recorder.current.stop();
      return pendingCapture.current?.promise??Promise.resolve(capturedText.current);
    }
    if (recognition.current) {
      try { recognition.current.stop(); } catch { finishCapture(capturedText.current); }
      return pendingCapture.current?.promise??Promise.resolve(capturedText.current);
    }
    // Release during a session/permission prompt invalidates that pending capture.
    captureEpoch.current++;captureAbort.current?.abort();pendingCapture.current?.complete('');
    return Promise.resolve(capturedText.current);
  },[finishCapture]);

  const listen=useCallback(():Promise<string>=> {
    if (intent.current||isClientLockedDown()) return Promise.resolve('');
    autoStop.current=true;startListening();
    return pendingCapture.current?.promise??Promise.resolve('');
  },[startListening]);
  const primeAudio=useCallback(()=> {
    if (typeof window==='undefined') return;
    const Ctx=window.AudioContext??(window as unknown as { webkitAudioContext?:typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!vadContext.current||vadContext.current.state==='closed') vadContext.current=new Ctx();
    void vadContext.current.resume().catch(()=>{});
  },[]);

  const speak=useCallback(async(text:string,explicitSpeaker?:string):Promise<void>=> {
    if (!text.trim()||isClientLockedDown()) return;
    stopPlayback();const version=playbackEpoch.current;const controller=new AbortController();playbackAbort.current=controller;
    const active=()=>mounted.current&&version===playbackEpoch.current&&!controller.signal.aborted&&!isClientLockedDown();
    beginSpeech();
    try {
      const selected=turn.current??await fetchTurn(controller);if(!active()) return;
      const response=await fetch('/api/voice/tts',{ method:'POST',headers:{ 'Content-Type':'application/json',...(selected.turnToken?{ 'X-Speech-Turn':selected.turnToken }:{}) },body:JSON.stringify({ text,speakerId:explicitSpeaker??speaker.current }),signal:controller.signal });
      if(!active()) return;
      if(response.status===501&&selected.mode==='legacy'&&!LOCAL_ONLY_CLIENT&&window.speechSynthesis) {
        const utterance=new SpeechSynthesisUtterance(text);
        // Browser synthesis provides no verifiable playback audio feed: keep avatar neutral.
        await new Promise<void>(resolve=> { playbackResolve.current=resolve;utterance.onend=()=>resolve();utterance.onerror=()=>resolve();window.speechSynthesis.speak(utterance);if(active()) setIsSpeaking(true); });
        return;
      }
      if(!response.ok) throw new Error('Speech unavailable. Text remains available.');
      const notice=response.headers.get('x-speech-notice');
      if(notice==='stored_voice_unavailable') setVoiceNotice('The saved voice is unavailable; the service default is being used. Choose a voice in Settings.');
      if(notice==='distinct_voice_profiles_unavailable') setVoiceNotice('VoiceStudio has no distinct agent profiles; its default voice is being used.');
      const blob=await response.blob();if(!active()) return;
      const url=URL.createObjectURL(blob);audioUrl.current=url;const playing=new Audio(url);audio.current=playing;
      try {
        const ctx=new AudioContext();context.current=ctx;const analyser=ctx.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=0.6;
        ctx.createMediaElementSource(playing).connect(analyser);analyser.connect(ctx.destination);
        const feed=createAnalyserFeed(analyser,playing);
        playing.onplaying=()=> {
          if(!active()) { playing.pause();return; } void ctx.resume().catch(()=>{});setAudioFeed(feed);setIsSpeaking(true);
          const update=()=> { if(!active()||playing.paused||playing.ended||playing.readyState<3) { stopMotion();return; }setLipSyncAmplitude(feed.read().rms);animation.current=requestAnimationFrame(update); };
          if(animation.current!==null) cancelAnimationFrame(animation.current);animation.current=requestAnimationFrame(update);
        };
      } catch { /* Audio remains usable without an animation feed. */ }
      playing.onpause=()=> { if(version===playbackEpoch.current) stopMotion(); };playing.onwaiting=()=> { if(version===playbackEpoch.current) stopMotion(); };
      await new Promise<void>((resolve,reject)=> { playbackResolve.current=resolve;playing.onended=()=>resolve();playing.onerror=()=>reject(new Error('Playback unavailable.'));if(!active()) { resolve();return; }void playing.play().then(()=> { if(active()) setIsSpeaking(true);else playing.pause(); }).catch(reject); });
    } catch(error) { if(active()) setVoiceNotice(error instanceof Error?error.message:'Speech unavailable.'); }
    finally {
      if(version===playbackEpoch.current) { turn.current=null;stopPlayback(); }
      endSpeech();
    }
  },[fetchTurn,stopMotion,stopPlayback]);
  return { startListening,stopListening,listen,stopSpeaking:stopPlayback,primeAudio,speak,isListening,isSpeaking,transcript,supported,lipSyncAmplitude,audioFeed,voiceNotice };
}
