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
  /**
   * Findings already marked past end of support that a date cannot place: no end date is listed,
   * or upstream lists a later date than the flag implies. Hiding them would understate the risk.
   */
  unplaced: Finding[];
}

export function supportEndingBy(findings: Finding[], date: string): SupportPlan {
  if (isoDate(date) === null) return { dated: [], unplaced: [] };
  const endsByDate = (finding: Finding) => finding.eolFrom !== null && finding.eolFrom <= date;
  return {
    dated: findings.filter(endsByDate).sort((a, b) => a.eolFrom!.localeCompare(b.eolFrom!)),
    // `daysRemaining` is null for an EOL finding only when its listed date is missing or still
    // ahead; an EOL finding with a past date was supported on any earlier date and stays out.
    unplaced: findings.filter(
      (finding) =>
        finding.status === 'eol' && finding.daysRemaining === null && !endsByDate(finding),
    ),
  };
}

export function formatDaysRemaining(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'today';
  const count = Math.abs(days);
  const unit = `${count} ${count === 1 ? 'day' : 'days'}`;
  return days < 0 ? `${unit} ago` : unit;
}
