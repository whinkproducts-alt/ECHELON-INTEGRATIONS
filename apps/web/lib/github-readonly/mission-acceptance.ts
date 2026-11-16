/** Mission acceptance from a read-only GitHub report: accepted only on observed, complete, passing checks at the expected commit. */
import type { buildHealthReport } from './report';

type Report = Awaited<ReturnType<typeof buildHealthReport>>;
export function evaluateMissionAcceptance(report: Report, expectedSha?: string): { accepted: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (report.verdict !== 'PASSING_OBSERVED_CHECKS') reasons.push(`verdict is ${report.verdict}`);
  if (report.incomplete) reasons.push('report is incomplete (more pages than were read)');
  if (expectedSha && report.commit !== expectedSha) reasons.push('branch head is not the commit the mission produced');
  return { accepted: reasons.length === 0, reasons };
}
