import { getOrgKit } from '@/lib/agent-loader';
import { prisma } from '@/lib/db';
import { PERSONAS } from '@/lib/personas';
import { SHARED_AGENT_SPEAKER } from '@/lib/speech-policy';
import { STAFF_DIRECTORY } from '@/lib/staff-directory';
/** Existing authenticated app roster; voice assignment never activates an agent or grants permissions. */
export async function isRosterSpeaker(id:string,userId?:string):Promise<boolean> {
 if(id==='whink'||id==='mamba'||id==='marcus'||id===SHARED_AGENT_SPEAKER) return true;
 if(Object.values(PERSONAS).some(p=>p.id.toLowerCase().replace('_','-')===id||p.id.toLowerCase()===id)) return true;
 if(userId&&await prisma.killTeamMember.findFirst({where:{userId,slug:id},select:{id:true}})) return true;
 if(STAFF_DIRECTORY.some(member=>member.id.toLowerCase()===id&&member.kind==='agent'&&member.status==='active')) return true;
 const kit=await getOrgKit();
 return kit.agents.some(agent=>agent.agent_id.toLowerCase()===id&&!['suspended','retired'].includes(agent.state));
}
