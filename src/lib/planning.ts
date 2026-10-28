import { isoDate } from './status.ts';
import type { Finding } from './types.ts';

/** Last day of the calendar quarter containing the user's local date, as YYYY-MM-DD. */
export function endOfQuarter(today: Date): string {
  const quarterEndMonth = Math.floor(today.getMonth() / 3) * 3 + 3;
  // Day 0 of the following month is the last day of this one; UTC keeps it free of DST shifts.
  return new Date(Date.UTC(today.getFullYear(), quarterEndMonth, 0)).toISOString().slice(0, 10);
}

export interface SupportPlan {
  /** Findings whose listed end-of-support date is on or before the chosen date, earliest first. */
  dated: Finding[];
  /** Findings already past end of support whose end date is unknown, so no date can be compared. */
  undated: Finding[];
}

export function supportEndingBy(findings: Finding[], date: string): SupportPlan {
  if (isoDate(date) === null) return { dated: [], undated: [] };
  return {
    dated: findings
      .filter((finding) => finding.eolFrom !== null && finding.eolFrom <= date)
      .sort((a, b) => a.eolFrom!.localeCompare(b.eolFrom!)),
    undated: findings.filter((finding) => finding.status === 'eol' && finding.eolFrom === null),
  };
}

export function formatDaysRemaining(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'today';
  const count = Math.abs(days);
  const unit = `${count} ${count === 1 ? 'day' : 'days'}`;
  return days < 0 ? `${unit} ago` : unit;
}
