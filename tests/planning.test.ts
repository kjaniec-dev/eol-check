import { afterEach, describe, expect, it } from 'vitest';
import { check } from '../src/lib/match.ts';
import { suggestMigrations } from '../src/lib/migrations.ts';
import { endOfQuarter, formatDaysRemaining, supportEndingBy } from '../src/lib/planning.ts';
import { daysUntil, localIsoDate, statusOf } from '../src/lib/status.ts';
import type { Component, Dataset, Release } from '../src/lib/types.ts';

const today = new Date(2026, 1, 1);
const rel = (name: string, eolFrom: string | null, isEol = false): Release => ({
  name,
  isEol,
  eolFrom,
  isLts: false,
});
const data: Dataset = {
  generatedAt: '2026-02-01',
  products: {
    nodejs: {
      label: 'Node.js',
      releases: [
        rel('18', '2025-04-30', true),
        rel('20', '2026-04-30'),
        rel('22', '2026-12-31'),
        rel('24', '2028-04-30'),
      ],
    },
  },
};
const node = (version: string): Component => ({
  source: 'Dockerfile',
  kind: 'image',
  label: `node:${version}`,
  product: 'nodejs',
  version,
});

describe('warning threshold', () => {
  it('moves the ok/soon boundary with the chosen number of days', () => {
    const release = rel('x', '2026-04-01'); // 59 days after today
    expect(statusOf(release, today, 30)).toBe('ok');
    expect(statusOf(release, today, 90)).toBe('soon');
    expect(statusOf(release, today)).toBe('soon');
    expect(statusOf(rel('x', '2026-02-01'), today, 30)).toBe('eol');
  });

  it('applies the threshold to findings and to migration targets', () => {
    const wide = check([node('18'), node('20'), node('22')], data, today, 365);
    expect(wide.map(({ status }) => status)).toEqual(['eol', 'soon', 'soon']);
    expect(wide[0]?.migrationSuggestions?.map(({ cycle }) => cycle)).toEqual(['24']);

    const narrow = check([node('18'), node('20'), node('22')], data, today, 30);
    expect(narrow.map(({ status }) => status)).toEqual(['eol', 'ok', 'ok']);
    expect(suggestMigrations(data.products.nodejs!.releases, '18', today, 30)).toHaveLength(3);
    expect(suggestMigrations(data.products.nodejs!.releases, '18', today, 365)).toHaveLength(1);
  });
});

describe('days remaining', () => {
  it('counts whole days until a date and goes negative afterwards', () => {
    expect(daysUntil('2026-02-11', today)).toBe(10);
    expect(daysUntil('2026-02-01', today)).toBe(0);
    expect(daysUntil('2026-01-30', today)).toBe(-2);
    expect(daysUntil('2026-02-01', new Date(2026, 1, 1, 10))).toBe(0);
    expect(daysUntil(null, today)).toBeNull();
    expect(daysUntil('2026-02-31', today)).toBeNull();
  });

  it('is attached to findings, but not when an EOL flag precedes the listed date', () => {
    const [ended, soon, flagged, undated] = check(
      [node('18'), node('20'), node('flagged'), node('python')],
      {
        ...data,
        products: {
          nodejs: {
            label: 'Node.js',
            releases: [
              ...data.products.nodejs!.releases,
              rel('flagged', '2030-01-01', true),
              rel('python', null),
            ],
          },
        },
      },
      today,
    );
    expect(ended?.daysRemaining).toBe(-277);
    expect(soon?.daysRemaining).toBe(88);
    expect(flagged).toMatchObject({ status: 'eol', daysRemaining: null });
    expect(undated).toMatchObject({ status: 'ok', daysRemaining: null });
  });

  it('formats days for display', () => {
    expect(formatDaysRemaining(null)).toBe('—');
    expect(formatDaysRemaining(0)).toBe('today');
    expect(formatDaysRemaining(1)).toBe('1 day');
    expect(formatDaysRemaining(88)).toBe('88 days');
    expect(formatDaysRemaining(-3)).toBe('3 days ago');
  });
});

describe('planning by date', () => {
  const findings = check([node('24'), node('22'), node('20'), node('18')], data, today);
  const cycles = (date: string) => supportEndingBy(findings, date).dated.map(({ cycle }) => cycle);

  it('lists findings whose end date is on or before the date, earliest first', () => {
    expect(cycles('2026-12-31')).toEqual(['18', '20', '22']);
    expect(cycles('2026-04-30')).toEqual(['18', '20']);
    expect(cycles('2026-04-29')).toEqual(['18']);
  });

  it('does not list findings that were still supported on a past date', () => {
    expect(cycles('2025-04-29')).toEqual([]);
    expect(cycles('2025-04-30')).toEqual(['18']);
  });

  it('keeps EOL findings that a date cannot place apart from dated results', () => {
    const flagged = check(
      [node('no-date'), node('future-date'), node('18')],
      {
        ...data,
        products: {
          nodejs: {
            label: 'Node.js',
            releases: [
              ...data.products.nodejs!.releases,
              rel('no-date', null, true),
              rel('future-date', '2030-01-01', true), // flagged EOL, but upstream lists a later date
            ],
          },
        },
      },
      today,
    );

    // 2024: Node 18 was still supported, but both flagged releases are already unsupported now.
    const early = supportEndingBy(flagged, '2024-01-01');
    expect(early.dated).toEqual([]);
    expect(early.unplaced.map(({ cycle }) => cycle)).toEqual(['no-date', 'future-date']);

    // Once the date passes the listed one, the dated release moves into the dated list.
    const late = supportEndingBy(flagged, '2030-06-01');
    expect(late.dated.map(({ cycle }) => cycle)).toEqual(['18', 'future-date']);
    expect(late.unplaced.map(({ cycle }) => cycle)).toEqual(['no-date']);

    // A past end date is never "unplaced": it was supported on earlier dates.
    expect(supportEndingBy(flagged, '2025-01-01').unplaced.map(({ cycle }) => cycle)).not.toContain(
      '18',
    );
  });

  it('ignores an empty or invalid date', () => {
    expect(supportEndingBy(findings, '')).toEqual({ dated: [], unplaced: [] });
    expect(supportEndingBy(findings, '2026-13-01')).toEqual({ dated: [], unplaced: [] });
  });

  it('finds the last day of the current quarter', () => {
    expect(endOfQuarter(new Date(2026, 0, 1))).toBe('2026-03-31');
    expect(endOfQuarter(new Date(2026, 4, 15, 12))).toBe('2026-06-30');
    expect(endOfQuarter(new Date(2026, 9, 28))).toBe('2026-12-31');
    expect(endOfQuarter(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });
});

describe.each(['Europe/Warsaw', 'America/Los_Angeles', 'Pacific/Auckland', 'UTC'])(
  'calendar dates in %s',
  (zone) => {
    const originalZone = process.env.TZ;
    afterEach(() => {
      if (originalZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalZone;
    });

    it('uses the local date for quarters, days left and status around midnight', () => {
      process.env.TZ = zone;
      const justAfterMidnight = new Date(2026, 3, 1, 0, 30); // 1 April, local
      const lateEvening = new Date(2026, 2, 31, 23, 30); // 31 March, local

      expect(localIsoDate(justAfterMidnight)).toBe('2026-04-01');
      expect(endOfQuarter(justAfterMidnight)).toBe('2026-06-30');
      expect(endOfQuarter(lateEvening)).toBe('2026-03-31');
      expect(daysUntil('2026-04-01', justAfterMidnight)).toBe(0);
      expect(daysUntil('2026-04-01', lateEvening)).toBe(1);
      expect(daysUntil('2026-04-30', justAfterMidnight)).toBe(29);
      expect(statusOf(rel('x', '2026-04-01'), justAfterMidnight)).toBe('eol');
      expect(statusOf(rel('x', '2026-04-01'), lateEvening)).toBe('soon');
    });
  },
);
