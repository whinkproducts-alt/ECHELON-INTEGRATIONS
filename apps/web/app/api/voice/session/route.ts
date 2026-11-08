export const dynamic='force-dynamic';
import { NextRequest,NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isLockedDown } from '@/lib/safety/lockdown';
import { selectedSpeech,signSpeechTurn } from '@/lib/speech-services';
export async function POST(req:NextRequest) {
  const session=await auth(); if (!session?.user?.id) return NextResponse.json({ error:'Unauthorized' },{ status:401 });
  if (await isLockedDown(session.user.id)) return NextResponse.json({ error:'Speech is stopped by lockdown.' },{ status:423 });
  try {
    const selected=await selectedSpeech(req,session.user.id);
    if (await isLockedDown(session.user.id)) return NextResponse.json({ error:'Speech is stopped by lockdown.' },{ status:423 });
    if (selected===null) return NextResponse.json({ error:'No verified local speech pair is available. Use text or run a speech check in Settings.' },{ status:503 });
    if (!selected) return NextResponse.json({ mode:'legacy',serverStt:process.env.STT_PROVIDER==='local-whisper' },{ headers:{ 'Cache-Control':'no-store' } });
    return NextResponse.json({ mode:'local',service:selected.service,serverStt:true,turnToken:signSpeechTurn(session.user.id,selected.service) },{ headers:{ 'Cache-Control':'no-store' } });
  } catch { return NextResponse.json({ error:'Speech selection unavailable. Check timezone and service settings.' },{ status:503 }); }
}
