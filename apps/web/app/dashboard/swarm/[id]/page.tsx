import { SwarmRunScreen } from '@/components/screens/swarm/run-screen';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SwarmRunScreen id={id} />;
}
