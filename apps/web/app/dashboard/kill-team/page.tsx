import { auth } from '@/auth';
import { KillTeamScreen } from '@/components/screens/kill-team/kill-team-screen';
import { isOwnerEmail } from '@/lib/owner';

export default async function KillTeamPage() {
  const session = await auth();
  const founder = isOwnerEmail(session?.user?.email);
  return <KillTeamScreen founder={founder} />;
}
