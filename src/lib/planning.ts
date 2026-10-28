import { isoDate } from './status.ts';
import type { Finding } from './types.ts';

/** Last day of the calendar quarter containing `today`, as YYYY-MM-DD (UTC). */
export function endOfQuarter(today: Date): string {
  const quarterEndMonth = Math.floor(today.getUTCMonth() / 3) * 3 + 3;
  return new Date(Date.UTC(today.getUTCFullYear(), quarterEndMonth, 0)).toISOString().slice(0, 10);
}

/**
 * Findings whose support has ended or ends on or before `date`, earliest first.
 * Findings without an end date are kept only when they are already past end of support.
 */
export function supportEndingBy(findings: Finding[], date: string): Finding[] {
  if (isoDate(date) === null) return [];
  return findings
    .filter(
      (finding) =>
        finding.status === 'eol' || (finding.eolFrom !== null && finding.eolFrom <= date),
    )
    .sort((a, b) => (a.eolFrom ?? '').localeCompare(b.eolFrom ?? ''));
}

export function formatDaysRemaining(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'today';
  const count = Math.abs(days);
  const unit = `${count} ${count === 1 ? 'day' : 'days'}`;
  return days < 0 ? `${unit} ago` : unit;
}
