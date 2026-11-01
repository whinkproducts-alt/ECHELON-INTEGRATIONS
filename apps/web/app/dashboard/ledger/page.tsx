import { LedgerScreen } from '@/components/screens/ledger';

/** Accepts ?correlationId=<id> so other screens can link to one turn's trail. */
export default async function Page({ searchParams }: { searchParams: Promise<{ correlationId?: string | string[] }> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.correlationId) ? sp.correlationId[0] : sp.correlationId;
  const correlationId = raw && /^[\w:.-]{1,100}$/.test(raw) ? raw : '';
  return <LedgerScreen initialCorrelationId={correlationId} />;
}
