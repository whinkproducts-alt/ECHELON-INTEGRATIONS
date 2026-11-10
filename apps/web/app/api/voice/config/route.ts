export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { isLockedDown } from '@/lib/safety/lockdown';
import { checkPermission } from '@/lib/permission-engine';
import { recordAction } from '@/lib/ledger';
import { dailySpeech, speechContext, speechSelectionEnabled, speechTarget } from '@/lib/speech-services';
import { isRosterSpeaker } from '@/lib/speech-roster';
import { canonicalSpeaker, KOKORO_VOICES, SPEECH_MODES, type SpeechMode, type SpeechResult, type SpeechService } from '@/lib/speech-policy';

export async function GET() {
  const session=await auth();
  if (!session?.user?.id) return NextResponse.json({ error:'Unauthorized' },{ status:401 });
  const userId=session.user.id;
  if (await isLockedDown(userId)) return NextResponse.json({ serverStt:false,locked:true },{ status:423 });
  if (!speechSelectionEnabled()) return NextResponse.json({ enabled:false,mode:'legacy',serverStt:process.env.STT_PROVIDER?.trim().toLowerCase()==='local-whisper' },{ headers:{ 'Cache-Control':'no-store' } });
  const context=await speechContext(userId);
  const latest=await prisma.speechDailyCheck.findFirst({ where:{ userId },orderBy:{ createdAt:'desc' } });
  const allowVoiceStudio=!!speechTarget('voicestudio',userId);
  const visibleCheck=latest?{ status:latest.status,checkedAt:latest.checkedAt,scheduledDay:latest.scheduledDay,timezone:latest.timezone,selected:latest.selected,reason:latest.reason,results:Array.isArray(latest.results)?(latest.results as unknown as SpeechResult[]).map(result=>result.service==='voicestudio'&&!allowVoiceStudio?{ ...result,configured:false,reachable:false,modelReady:false,healthy:false,voices:[],failure:'not_configured' }:result):latest.results }:null;
  const assignments=(context.pref?.voiceAssignments??{}) as Record<string,unknown>;
  const visibleAssignments=allowVoiceStudio?assignments:{ 'whisper-kokoro':assignments['whisper-kokoro']??{} };
  return NextResponse.json({ enabled:true,accountId:userId,mode:context.mode,serverStt:context.mode!=='legacy',timezone:context.timezone,timezoneConfirmed:context.timezone!==null&&context.pref?.confirmedTimezone===context.timezone,selectedService:context.mode==='auto'?context.pref?.selectedService:context.mode,voiceAssignments:visibleAssignments,lastCheck:visibleCheck,services:(['whisper-kokoro','voicestudio'] as SpeechService[]).map(service=>({ service,configured:!!speechTarget(service,userId) })) },{ headers:{ 'Cache-Control':'no-store' } });
}
export async function POST(req:NextRequest) {
  const session=await auth();
  if (!session?.user?.id) return NextResponse.json({ error:'Unauthorized' },{ status:401 });
  const userId=session.user.id;
  if (await isLockedDown(userId)) return NextResponse.json({ error:'Speech settings are unavailable during lockdown.' },{ status:423 });
  if (!speechSelectionEnabled()) return NextResponse.json({ error:'Speech selection is not enabled by this installation.' },{ status:503 });
  const length=Number(req.headers.get('content-length')??'0');
  if (length>8192) return NextResponse.json({ error:'Request too large' },{ status:413 });
  let body: { mode?:unknown;confirmTimezone?:unknown;test?:unknown;voice?:unknown;speakerId?:unknown;service?:unknown };
  try { const text=await req.text(); if (text.length>8192) throw new Error(); body=JSON.parse(text); } catch { return NextResponse.json({ error:'Invalid request' },{ status:400 }); }
  const permission=await checkPermission(userId,body.test===true?'speech_health_check':'speech_preferences_set','A');
  if (!permission.allowed) return NextResponse.json({ error:'Permission denied' },{ status:403 });
  const context=await speechContext(userId);
  if (!context.timezone || (body.confirmTimezone!==undefined && body.confirmTimezone!==context.timezone)) return NextResponse.json({ error:'Set a valid profile timezone and confirm the displayed timezone.' },{ status:400 });
  const mode=body.mode===undefined?context.mode:body.mode;
  if (!SPEECH_MODES.includes(mode as SpeechMode)) return NextResponse.json({ error:'Invalid speech mode' },{ status:400 });
  if (mode==='auto' && body.confirmTimezone!==context.timezone && context.pref?.confirmedTimezone!==context.timezone) return NextResponse.json({ error:'Confirm the timezone for daily 5 a.m. checks.' },{ status:400 });
  const data: { mode?:string;confirmedTimezone?:string;voiceAssignments?:Record<string,Record<string,string>> }={};
  if (body.mode!==undefined) data.mode=mode as string;
  if (body.confirmTimezone===context.timezone) data.confirmedTimezone=context.timezone;
  if (body.voice!==undefined) {
    if (body.service==='voicestudio'&&!speechTarget('voicestudio',userId)) return NextResponse.json({ error:'VoiceStudio is not configured for this account' },{ status:403 });
    if (!['whisper-kokoro','voicestudio'].includes(body.service as string) || typeof body.voice!=='string' || typeof body.speakerId!=='string' || canonicalSpeaker(body.speakerId)!==body.speakerId) return NextResponse.json({ error:'Invalid voice assignment' },{ status:400 });
    if (!await isRosterSpeaker(body.speakerId)) return NextResponse.json({ error:'Choose a canonical agent ID from your app roster.' },{ status:400 });
    const latest=await prisma.speechDailyCheck.findFirst({ where:{ userId,status:'COMPLETED' },orderBy:{ checkedAt:'desc' } });
    const results=Array.isArray(latest?.results)?latest.results as unknown as SpeechResult[]:[];
    const allowed=body.service==='whisper-kokoro'?KOKORO_VOICES:results.find(result=>result.service==='voicestudio')?.voices??[];
    if (!allowed.includes(body.voice)) return NextResponse.json({ error:'Choose a discovered voice profile. Run a service check first.' },{ status:400 });
    const assignments=(context.pref?.voiceAssignments??{}) as Record<string,Record<string,string>>;
    if (Object.keys(assignments[body.service as string]??{}).length>=100 && !assignments[body.service as string]?.[body.speakerId]) return NextResponse.json({ error:'Voice assignment limit reached' },{ status:400 });
    data.voiceAssignments={ ...assignments,[body.service as string]:{ ...(assignments[body.service as string]??{}),[body.speakerId]:body.voice } };
  }
  // Serialize edits on the owning account row, then merge the latest voice map.
  // Both simultaneous edits to distinct speakers survive; no client-supplied account ID is used.
  await prisma.$transaction(async tx=> {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id"=${userId} FOR UPDATE`;
    const current=await tx.speechPreference.findUnique({ where:{ userId } });
    if (body.voice!==undefined) {
      const assignments=(current?.voiceAssignments??{}) as Record<string,Record<string,string>>;
      data.voiceAssignments={ ...assignments,[body.service as string]:{ ...(assignments[body.service as string]??{}),[body.speakerId as string]:body.voice as string } };
    }
    await tx.speechPreference.upsert({ where:{ userId },create:{ userId,...data },update:data });
  });
  await recordAction({ userId,action:body.test===true?'speech_test_requested':'speech_preferences_set',permissionClass:'A',status:'EXECUTED',initiator:'user',inputSummary:JSON.stringify({ mode:body.mode??context.mode,voiceChanged:body.voice!==undefined,timezone:context.timezone }) });
  if (body.test===true) {
    try { const check=await dailySpeech(userId,new Date(),true); return NextResponse.json({ check:{ status:check.status,checkedAt:check.checkedAt,scheduledDay:check.scheduledDay,timezone:check.timezone,selected:check.selected,reason:check.reason } },{ headers:{ 'Cache-Control':'no-store' } }); }
    catch { return NextResponse.json({ error:'Speech check unavailable. Verify timezone, lockdown and installation.' },{ status:503 }); }
  }
  return NextResponse.json({ saved:true,nextTurn:true });
}
