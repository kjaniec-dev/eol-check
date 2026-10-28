import { daysUntil, SOON_DAYS, statusOf } from './status.ts';
import type { MigrationSuggestion, Release } from './types.ts';

export const MIGRATION_DISCLAIMER =
  'Suggestions are based on product lifecycle data and do not guarantee application compatibility.';
export const NO_MIGRATIONS_MESSAGE = 'No newer supported cycles found.';

function numericCycle(cycle: string): number[] | null {
  if (!/^\d+(?:\.\d+)*$/.test(cycle)) return null;
  return cycle.split('.').map(Number);
}

function compareCycles(left: number[], right: number[]): number {
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function suggestMigrations(
  releases: Release[],
  currentCycle: string,
  today: Date,
  soonDays = SOON_DAYS,
): MigrationSuggestion[] {
  const current = numericCycle(currentCycle);
  if (!current) return [];

  const todayDate = today.toISOString().slice(0, 10);
  const candidates = releases.flatMap((release) => {
    const candidate = numericCycle(release.name);
    if (!candidate || compareCycles(candidate, current) <= 0) return [];
    if (release.releaseDate && release.releaseDate > todayDate) return [];
    if (statusOf(release, today, soonDays) !== 'ok') return [];

    return [
      {
        release,
        suggestion: {
          cycle: release.name,
          isLts: release.isLts,
          eolFrom: release.eolFrom,
          supportDaysRemaining: daysUntil(release.eolFrom, today),
        },
      },
    ];
  });

  return candidates
    .sort((a, b) => {
      if (a.release.isLts !== b.release.isLts) return a.release.isLts ? -1 : 1;
      return compareCycles(numericCycle(b.release.name)!, numericCycle(a.release.name)!);
    })
    .slice(0, 3)
    .map(({ suggestion }) => suggestion);
}

export function formatMigrationSuggestion(suggestion: MigrationSuggestion): string {
  const lts = suggestion.isLts ? ' (LTS)' : '';
  if (suggestion.eolFrom && suggestion.supportDaysRemaining !== null) {
    return `${suggestion.cycle}${lts} — support ends ${suggestion.eolFrom} (${suggestion.supportDaysRemaining} days remaining)`;
  }
  return `${suggestion.cycle}${lts} — end-of-support date unavailable`;
}

export function formatMigrationSuggestions(suggestions: MigrationSuggestion[]): string {
  return suggestions.length
    ? suggestions.map(formatMigrationSuggestion).join('; ')
    : NO_MIGRATIONS_MESSAGE;
}
