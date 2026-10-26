import { describe, expect, it } from 'vitest';
import { formatMigrationSuggestion, suggestMigrations } from '../src/lib/migrations.ts';
import type { Release } from '../src/lib/types.ts';

const today = new Date('2026-02-01T00:00:00Z');

const release = (name: string, options: Partial<Omit<Release, 'name'>> = {}): Release => ({
  name,
  isEol: false,
  eolFrom: '2027-02-01',
  isLts: false,
  ...options,
});

describe('migration suggestions', () => {
  it('prefers LTS cycles, sorts each group numerically, and returns at most three', () => {
    const suggestions = suggestMigrations(
      [
        release('8.9'),
        release('8.10'),
        release('9.2', { isLts: true }),
        release('10.0', { isLts: true }),
        release('11.0'),
        release('12.0'),
      ],
      '8.8',
      today,
    );

    expect(suggestions.map(({ cycle }) => cycle)).toEqual(['10.0', '9.2', '12.0']);
  });

  it('excludes current, older, nonnumeric, future, EOL, and soon-ending cycles', () => {
    const suggestions = suggestMigrations(
      [
        release('8.1'),
        release('8.2', { releaseDate: '2026-02-02' }),
        release('8.3', { eolFrom: '2026-07-31' }),
        release('8.4', { isEol: true }),
        release('8.5', { eolFrom: '2025-12-31' }),
        release('8.6-beta'),
        release('8.7', { eolFrom: '2026-08-01' }),
      ],
      '8.1',
      today,
    );

    expect(suggestions.map(({ cycle }) => cycle)).toEqual(['8.7']);
  });

  it('keeps suggestions without dates but does not invent a remaining support period', () => {
    const suggestions = suggestMigrations(
      [release('9', { eolFrom: null, releaseDate: null })],
      '8',
      today,
    );

    expect(suggestions).toEqual([
      { cycle: '9', isLts: false, eolFrom: null, supportDaysRemaining: null },
    ]);
    expect(formatMigrationSuggestion(suggestions[0]!)).toContain('end-of-support date unavailable');
  });

  it('calculates the remaining support period from the report date', () => {
    const suggestions = suggestMigrations([release('9', { eolFrom: '2027-02-01' })], '8', today);

    expect(suggestions[0]?.supportDaysRemaining).toBe(365);
    expect(formatMigrationSuggestion(suggestions[0]!)).toContain('365 days remaining');
  });

  it('does not guess a migration path for nonnumeric current cycles', () => {
    expect(suggestMigrations([release('2027')], 'jammy', today)).toEqual([]);
  });
});
