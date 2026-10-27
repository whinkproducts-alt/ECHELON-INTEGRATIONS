import { notFound } from 'next/navigation';
import { getSubsidiary, isSubsidiaryId } from '@/lib/subsidiaries';
import { SubsidiaryScreen } from '@/components/screens/subsidiaries/subsidiary-screen';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === 'unassigned') return <SubsidiaryScreen id="unassigned" subsidiary={null} />;
  if (!isSubsidiaryId(id)) notFound();
  const subsidiary = getSubsidiary(id);
  if (!subsidiary) notFound();
  return <SubsidiaryScreen id={id} subsidiary={subsidiary} />;
}
