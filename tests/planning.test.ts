import { describe, expect, it } from 'vitest';
import { check } from '../src/lib/match.ts';
import { suggestMigrations } from '../src/lib/migrations.ts';
import { endOfQuarter, formatDaysRemaining, supportEndingBy } from '../src/lib/planning.ts';
import { daysUntil, statusOf } from '../src/lib/status.ts';
import type { Component, Dataset, Release } from '../src/lib/types.ts';

const today = new Date('2026-02-01T00:00:00Z');
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
    expect(daysUntil('2026-02-01', new Date('2026-02-01T10:00:00Z'))).toBe(0);
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

  it('lists ended and soon-ending findings up to the date, earliest first', () => {
    expect(supportEndingBy(findings, '2026-12-31').map(({ cycle }) => cycle)).toEqual([
      '18',
      '20',
      '22',
    ]);
    expect(supportEndingBy(findings, '2026-04-30').map(({ cycle }) => cycle)).toEqual(['18', '20']);
    expect(supportEndingBy(findings, '2026-04-29').map(({ cycle }) => cycle)).toEqual(['18']);
  });

  it('ignores an empty or invalid date', () => {
    expect(supportEndingBy(findings, '')).toEqual([]);
    expect(supportEndingBy(findings, '2026-13-01')).toEqual([]);
  });

  it('finds the last day of the current quarter', () => {
    expect(endOfQuarter(new Date('2026-01-01T00:00:00Z'))).toBe('2026-03-31');
    expect(endOfQuarter(new Date('2026-05-15T12:00:00Z'))).toBe('2026-06-30');
    expect(endOfQuarter(new Date('2026-10-28T00:00:00Z'))).toBe('2026-12-31');
    expect(endOfQuarter(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12-31');
  });
});
