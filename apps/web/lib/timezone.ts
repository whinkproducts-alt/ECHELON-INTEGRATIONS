/**
 * timezone.ts
 * Local-date helpers. Default TZ: America/Edmonton (or WHINK_TIMEZONE env).
 */

export const DEFAULT_TZ = process.env.WHINK_TIMEZONE ?? 'America/Edmonton';

/** Returns "YYYY-MM" in the given timezone */
export function localYearMonth(tz = DEFAULT_TZ, date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
  });
  return fmt.format(date); // → "2026-11"
}

/** Returns the first moment of the given month (UTC midnight of local day 1) */
export function monthStart(yearMonth: string, tz = DEFAULT_TZ): Date {
  // yearMonth = "YYYY-MM"
  const [year, month] = yearMonth.split('-').map(Number);
  // Build the local midnight string in ISO form, then convert to UTC via the
  // Intl trick: format a known UTC time and invert.
  const localMidnight = `${yearMonth}-01T00:00:00`;
  // We need the UTC offset at that local moment in `tz`.
  // Approach: construct the date as if UTC, measure the actual local time, and
  // correct the difference.
  const naiveUtc = new Date(`${localMidnight}Z`);
  const localStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(naiveUtc);
  // localStr format: "2026-11-01, 17:00:00" (varies by TZ offset)
  // Parse it back to find offset
  const [datePart, timePart] = localStr.split(', ');
  const [lYear, lMonth, lDay] = datePart.split('-').map(Number);
  const [lHour, lMin, lSec] = timePart.split(':').map(Number);
  const localDate = new Date(Date.UTC(lYear, lMonth - 1, lDay, lHour, lMin, lSec));
  const offsetMs = localDate.getTime() - naiveUtc.getTime();
  // The UTC equivalent of local midnight = naiveUtc - offsetMs
  return new Date(naiveUtc.getTime() - offsetMs);
}

/** Returns "YYYY-MM-DD" in the given timezone */
export function localDateString(tz = DEFAULT_TZ, date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** True if two dates fall in the same local calendar month */
export function sameLocalMonth(a: Date, b: Date, tz = DEFAULT_TZ): boolean {
  return localYearMonth(tz, a) === localYearMonth(tz, b);
}
