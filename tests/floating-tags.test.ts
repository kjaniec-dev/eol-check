import { describe, expect, it } from 'vitest';
import { check } from '../src/lib/match.ts';
import { parseAny } from '../src/lib/parsers/index.ts';
import type { Dataset } from '../src/lib/types.ts';

const data: Dataset = {
  generatedAt: '2026-10-25',
  products: {
    redis: {
      label: 'Redis',
      releases: [
        { name: '8.8', isEol: false, eolFrom: '2028-01-01', isLts: false },
        { name: '8.0', isEol: true, eolFrom: '2025-01-01', isLts: false },
        { name: '8.10', isEol: false, eolFrom: '2030-01-01', isLts: false },
        { name: '9.0', isEol: false, eolFrom: '2031-01-01', isLts: false },
      ],
    },
  },
};
const today = new Date(2026, 9, 25);
const findings = (text: string) => check(parseAny(text).components, data, today);

describe('floating container major tags', () => {
  it.each(['8', '8-alpine', 'v8'])(
    'resolves tag %s to the highest numeric known cycle in the same major',
    (tag) => {
      expect(findings(`services:\n  cache: {image: 'redis:${tag}'}`)[0]).toMatchObject({
        status: 'ok',
        cycle: '8.10',
        eolFrom: '2030-01-01',
        component: { version: '8' },
        note: expect.stringContaining('8.10'),
      });
    },
  );

  it('keeps a declared minor cycle exact', () => {
    expect(findings('FROM redis:8.0')[0]).toMatchObject({
      status: 'eol',
      cycle: '8.0',
      note: null,
    });
  });

  it('works after ARG expansion and in Kubernetes workload images', () => {
    for (const text of [
      'ARG VERSION=8\nFROM redis:$VERSION',
      'apiVersion: v1\nkind: Pod\nspec:\n  containers: [{image: "redis:8"}]',
    ])
      expect(findings(text)[0]).toMatchObject({
        cycle: '8.10',
        note: expect.stringContaining('Floating major tag'),
      });
  });

  it('does not infer the current cycle for a digest-pinned image, including ARG expansion', () => {
    for (const text of ['FROM redis:8@sha256:abc', 'ARG IMAGE=redis:8@sha256:abc\nFROM $IMAGE']) {
      expect(findings(text)[0]).toMatchObject({ status: 'unknown', cycle: null });
    }
  });

  it('does not reinterpret runtime pins as container aliases', () => {
    expect(
      check(
        [
          {
            source: '.tool-versions',
            kind: 'runtime',
            label: 'Redis 8',
            product: 'redis',
            version: '8',
          },
        ],
        data,
        today,
      )[0],
    ).toMatchObject({ status: 'unknown', cycle: null });
  });

  it('prefers an existing major lifecycle and leaves missing majors unknown', () => {
    const majorData: Dataset = {
      ...data,
      products: {
        redis: {
          ...data.products.redis!,
          releases: [
            ...data.products.redis!.releases,
            { name: '8', isEol: false, eolFrom: '2032-01-01', isLts: false },
          ],
        },
      },
    };
    expect(check(parseAny('FROM redis:8').components, majorData, today)[0]).toMatchObject({
      cycle: '8',
      note: null,
    });
    expect(findings('FROM redis:10')[0]).toMatchObject({ status: 'unknown', cycle: null });
  });
});
