import type { Release, Status } from './types.ts';

export const SOON_DAYS = 180;
export const SOON_DAYS_OPTIONS = [30, 90, 180, 365] as const;

const DAY_MS = 86_400_000;

export function isoDate(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}

/** Whole days from `today` until `date`; negative once the date has passed. */
export function daysUntil(date: string | null | undefined, today: Date): number | null {
  const time = isoDate(date);
  // `+ 0` turns -0 (a date earlier today) into 0.
  return time === null ? null : Math.ceil((time - today.getTime()) / DAY_MS) + 0;
}

export function statusOf(release: Release, today: Date, soonDays = SOON_DAYS): Status {
  if (release.isEol) return 'eol';
  if (!release.eolFrom) return 'ok';
  const eol = new Date(release.eolFrom + 'T00:00:00Z').getTime();
  const now = today.getTime();
  if (eol <= now) return 'eol';
  return eol - now <= soonDays * DAY_MS ? 'soon' : 'ok';
}
