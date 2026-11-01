import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { isOwnerEmail } from '@/lib/owner';
import { IntegrationHub } from './_components/integration-hub';

export default async function IntegrationsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  // The Hub is the Founder's control plane. Anyone else sees a plain refusal, and the API enforces it again.
  if (!isOwnerEmail(session.user.email)) {
    return <div className="p-6 max-w-3xl mx-auto text-sm text-muted-foreground">The Integration Hub is available to the account owner only.</div>;
  }
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <IntegrationHub />
    </div>
  );
}
