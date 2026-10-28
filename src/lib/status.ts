import type { Release, Status } from './types.ts';

export const SOON_DAYS = 180;
export const SOON_DAYS_OPTIONS = [30, 90, 180, 365] as const;

const DAY_MS = 86_400_000;

/** Parses a YYYY-MM-DD calendar date to its UTC-midnight timestamp, or null when invalid. */
export function isoDate(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}

/** The user's local calendar date as YYYY-MM-DD. */
export function localIsoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Whole calendar days from the local date of `today` until `date`; negative once the date has
 * passed. Time of day is ignored, so a date earlier today is 0.
 */
export function daysUntil(date: string | null | undefined, today: Date): number | null {
  const time = isoDate(date);
  const todayTime = isoDate(localIsoDate(today));
  return time === null || todayTime === null ? null : Math.round((time - todayTime) / DAY_MS);
}

export function statusOf(release: Release, today: Date, soonDays = SOON_DAYS): Status {
  if (release.isEol) return 'eol';
  const days = daysUntil(release.eolFrom, today);
  if (days === null) return 'ok';
  if (days <= 0) return 'eol';
  return days <= soonDays ? 'soon' : 'ok';
}
