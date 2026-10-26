import { describe, expect, it } from 'vitest';
import { minVersion, parsePackageJson } from '../src/lib/parsers/packagejson.ts';

describe('npm version ranges', () => {
  it.each([
    ['^5', '5.0.0'],
    ['~5.2', '5.2.0'],
    ['>=5', '5.0.0'],
    ['>5', '6.0.0'],
    ['>5.2', '5.3.0'],
    ['>5.2.3', '5.2.4'],
    ['>=4 <5', '4.0.0'],
    ['<5 >=4', '4.0.0'],
    ['<=5 >=4.2', '4.2.0'],
    ['>=4 >=5', '5.0.0'],
    ['5.x', '5.0.0'],
    ['4.2 - 5.3', '4.2.0'],
    ['^6 || ^4', '4.0.0'],
    ['>=5 <4 || >=6', '6.0.0'],
    ['>=6 || >1.0.0 <1.0.1', '6.0.0'],
    ['5.6.3', '5.6.3'],
  ])('finds the minimum admitted by %s', (range, expected) => {
    expect(minVersion(range)).toBe(expected);
  });

  it.each(['<5', '<=5', '<5 || >=6', '*', 'latest', '>=5 <4', 'github:org/repo#v5', 'file:../v5', 'nonsense5'])
    ('does not invent a minimum for %s', (range) => {
      expect(minVersion(range)).toBeNull();
    });

  it('applies range interpretation to Node engines and framework dependencies', () => {
    const components = parsePackageJson(JSON.stringify({
      engines: { node: '>18' },
      dependencies: { react: '<19 >=18', vue: '<3' },
    }));
    expect(components.map(({ product, version }) => [product, version])).toEqual([
      ['nodejs', '19.0.0'], ['react', '18.0.0'], ['vue', null],
    ]);
    expect(components.map(({ versionBasis }) => versionBasis)).toEqual(['minimum', 'minimum', 'range']);
  });

  it('distinguishes an exact declaration from a computed range minimum', () => {
    const components = parsePackageJson(JSON.stringify({ dependencies: { react: '19.0.0', vue: '^3.5.0' } }));
    expect(components.map(({ product, version, versionBasis }) => [product, version, versionBasis])).toEqual([
      ['react', '19.0.0', 'declared'], ['vue', '3.5.0', 'minimum'],
    ]);
  });
});
