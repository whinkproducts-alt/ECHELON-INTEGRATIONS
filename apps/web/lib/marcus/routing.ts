import { getSubsidiary, isSubsidiaryId } from '@/lib/subsidiaries';

/**
 * Match free text such as "Finance" to a real directorate name. Unknown text means no preference: the router only
 * uses a directorate as a scoring bonus, and Marcus sends free text, so an unmatched value must not fail a task.
 */
export function matchDirectorate(input: string | null | undefined, directorates: readonly string[]): string | null {
  const t = (input ?? '').trim().toLowerCase();
  if (t.length < 3) return null;
  const exact = directorates.find((d) => d.toLowerCase() === t);
  if (exact) return exact;
  const hits = directorates.filter((d) => d.toLowerCase().includes(t));
  return hits.length === 1 ? hits[0] : null;
}

export type SubsidiaryScope = { subsidiary: string | null; targets: string[] };

/** Origin subsidiary and the other subsidiaries a request involves. Ids must be real; this is the trust boundary. */
export function parseSubsidiaries(origin: unknown, targets: unknown): { ok: true; value: SubsidiaryScope } | { ok: false; error: string } {
  if (origin !== undefined && origin !== null && !isSubsidiaryId(origin)) return { ok: false, error: 'Unknown subsidiary' };
  if (targets === undefined || targets === null) return { ok: true, value: { subsidiary: (origin as string | null | undefined) ?? null, targets: [] } };
  if (!Array.isArray(targets) || targets.length > 4 || !targets.every(isSubsidiaryId)) return { ok: false, error: 'Unknown or too many target subsidiaries' };
  const unique = [...new Set(targets as string[])];
  return { ok: true, value: { subsidiary: (origin as string | null | undefined) ?? null, targets: unique } };
}

/** "For WHINK Consult, with WHINK Apps: " or an empty string. Names come from config, never from the request. */
export function subsidiaryContext(scope: SubsidiaryScope): string {
  const name = (id: string) => getSubsidiary(id)?.name ?? id;
  const others = scope.targets.filter((t) => t !== scope.subsidiary);
  if (!scope.subsidiary && !others.length) return '';
  const from = scope.subsidiary ? `For ${name(scope.subsidiary)}` : 'Across subsidiaries';
  return `${from}${others.length ? `, with ${others.map(name).join(', ')}` : ''}: `;
}
