import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { check, findRelease, sortFindings, statusOf } from '../src/lib/match.ts';
import { detectFileType, parseAny } from '../src/lib/parsers/index.ts';
import { parseDockerfile } from '../src/lib/parsers/dockerfile.ts';
import { parseGoMod } from '../src/lib/parsers/gomod.ts';
import { parsePackageJson } from '../src/lib/parsers/packagejson.ts';
import { parsePomXml } from '../src/lib/parsers/pomxml.ts';
import type { Dataset, Release } from '../src/lib/types.ts';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const pick = (cs: { label: string; product: string | null; version: string | null }[]) =>
  cs.map((c) => [c.product, c.version]);

describe('parsers', () => {
  it('Dockerfile: images, codenames, digests, stage refs, unpinned', () => {
    const cs = parseDockerfile(fx('Dockerfile'));
    expect(pick(cs)).toEqual([
      ['nodejs', '18.19'],
      ['dotnet', '6.0'],
      ['debian', '12'],
      ['postgresql', '16'],
      ['python', null],
      ['nodejs', '18'], // resolved from the global ARG default
    ]);
  });

  it('go.mod', () => {
    expect(pick(parseGoMod(fx('go.mod')))).toEqual([['go', '1.21']]);
    expect(parseGoMod('module x')).toEqual([]);
  });

  it('package.json', () => {
    expect(pick(parsePackageJson(fx('package.json')))).toEqual([
      ['nodejs', '18'],
      ['react', '17.0.2'],
      ['nextjs', '13.4.1'],
      ['vue', null],
      [null, '5.4.5'], // no upstream lifecycle data; keep visible as unknown
    ]);
    expect(parsePackageJson('not json')).toEqual([]);
  });

  it('pom.xml', () => {
    expect(pick(parsePomXml(fx('pom.xml')))).toEqual([
      [null, '8'], // the manifest does not identify the JDK distribution
      ['spring-boot', '2.7.18'],
    ]);
  });

  it('detects file types from content', () => {
    expect(detectFileType(fx('package.json'))).toBe('package.json');
    expect(detectFileType(fx('pom.xml'))).toBe('pom.xml');
    expect(detectFileType(fx('go.mod'))).toBe('go.mod');
    expect(detectFileType(fx('Dockerfile'))).toBe('Dockerfile');
    expect(detectFileType('hello')).toBeNull();
    expect(parseAny('hello').components).toEqual([]);
  });

  it('keeps Java distributions distinct from unspecified Java images', () => {
    expect(pick(parseDockerfile('FROM openjdk:17\nFROM eclipse-temurin:17\nFROM amazoncorretto:17'))).toEqual([
      [null, '17'],
      ['eclipse-temurin', '17'],
      ['amazon-corretto', '17'],
    ]);
  });
});

// Synthetic dataset for logic tests only; the site uses the real snapshot from scripts/fetch-eol.ts.
const rel = (name: string, eolFrom: string | null, isEol = false): Release => ({ name, eolFrom, isEol, isLts: false });
const data: Dataset = {
  generatedAt: '2026-01-01T00:00:00Z',
  products: {
    nodejs: { label: 'Node.js', releases: [rel('18', '2025-04-30', true), rel('20', '2026-04-30'), rel('22', '2027-04-30')] },
    python: { label: 'Python', releases: [rel('3', null), rel('3.11', '2027-10-31')] },
  },
};
const today = new Date('2026-02-01T00:00:00Z');

describe('matching', () => {
  it('picks the longest cycle on a segment boundary', () => {
    const rs = data.products.python!.releases;
    expect(findRelease(rs, '3.11.4')?.name).toBe('3.11');
    expect(findRelease(rs, '3.1')?.name).toBe('3'); // not "3.11"
    expect(findRelease(rs, '4.0')).toBeNull();
  });

  it('classifies eol / soon / ok by date', () => {
    expect(statusOf(rel('x', '2026-01-31'), today)).toBe('eol');
    expect(statusOf(rel('x', '2026-06-01'), today)).toBe('soon');
    expect(statusOf(rel('x', '2027-01-01'), today)).toBe('ok');
    expect(statusOf(rel('x', null), today)).toBe('ok');
    expect(statusOf(rel('x', '2030-01-01', true), today)).toBe('eol');
  });

  it('reports unknowns with a reason and sorts worst first', () => {
    const cs = [
      ...parseDockerfile('FROM node:22\nFROM node:18\nFROM python\nFROM foo:1\nFROM node:20'),
    ];
    const f = sortFindings(check(cs, data, today));
    expect(f.map((x) => x.status)).toEqual(['eol', 'soon', 'unknown', 'unknown', 'ok']);
    expect(f.filter((x) => x.status === 'unknown').map((x) => x.note)).toEqual([
      'Version not pinned',
      'Unrecognised product',
    ]);
  });
});
