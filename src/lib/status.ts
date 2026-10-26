import type { Release, Status } from './types.ts';

export const SOON_DAYS = 180;

export function statusOf(release: Release, today: Date): Status {
  if (release.isEol) return 'eol';
  if (!release.eolFrom) return 'ok';
  const eol = new Date(release.eolFrom + 'T00:00:00Z').getTime();
  const now = today.getTime();
  if (eol <= now) return 'eol';
  return eol - now <= SOON_DAYS * 86_400_000 ? 'soon' : 'ok';
}
