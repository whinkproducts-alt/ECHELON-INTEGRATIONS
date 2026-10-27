import { ContractDetailScreen } from '@/components/screens/contracts/contract-detail-screen';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContractDetailScreen id={id} />;
}
