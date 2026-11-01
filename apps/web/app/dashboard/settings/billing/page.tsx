import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { BillingSurface } from './_components/billing-surface';

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">Plan and usage details</p>
      </div>
      <BillingSurface />
    </div>
  );
}
