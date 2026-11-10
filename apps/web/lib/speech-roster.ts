import { getOrgKit } from '@/lib/agent-loader';
import { STAFF_DIRECTORY } from '@/lib/staff-directory';
/** Existing authenticated app roster; voice assignment never activates an agent or grants permissions. */
export async function isRosterSpeaker(id:string):Promise<boolean> {
 if(id==='whink'||id==='mamba') return true;
 if(STAFF_DIRECTORY.some(member=>member.id.toLowerCase()===id&&member.kind==='agent'&&member.status==='active')) return true;
 const kit=await getOrgKit();
 return kit.agents.some(agent=>agent.agent_id.toLowerCase()===id&&!['suspended','retired'].includes(agent.state));
}
