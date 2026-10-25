import { describe, expect, it } from 'vitest';
import { parsePackageLock, parsePnpmLock, parseYarnLock } from '../src/lib/parsers/javascript-locks.ts';

const versions = (items: ReturnType<typeof parsePackageLock>) => items.map(({ product, version }) => [product, version]);

describe('package-lock.json', () => {
  it('walks v1 nested dependencies and deduplicates exact installations', () => {
    expect(versions(parsePackageLock(JSON.stringify({ name: 'react', version: '99.0.0', dependencies: {
      react: { version: '18.2.0', dependencies: { react: { version: '17.0.2' } } },
      wrapper: { version: '1.0.0', dependencies: { react: { version: '18.2.0' }, '@angular/core': { version: '16.2.12' } } },
    } })))).toEqual([['react', '18.2.0'], ['react', '17.0.2'], ['angular', '16.2.12']]);
  });

  it.each([2, 3])('reads v%s packages including nested scoped paths, ignoring roots and ranges', (lockfileVersion) => {
    const result = parsePackageLock(JSON.stringify({ lockfileVersion, packages: {
      '': { name: 'react', version: '99.0.0', dependencies: { vue: '^3' } },
      'node_modules/react': { version: '18.3.1' },
      'node_modules/wrapper/node_modules/@angular/core': { version: '18.2.0' },
      'node_modules/@scope/wrapper/node_modules/react': { version: '19.0.0-rc.1' },
      'node_modules/typescript': { version: '5.6.3' },
      'packages/react': { version: '99.0.0' },
      'node_modules/constructor': { version: '1.0.0' },
    }, dependencies: { vue: { version: '3.0.0' } } }));
    expect(versions(result)).toEqual([['react', '18.3.1'], ['angular', '18.2.0'], ['react', '19.0.0-rc.1'], [null, '5.6.3']]);
    expect(result[3]).toMatchObject({ source: 'package-lock.json', kind: 'framework', productLabel: 'TypeScript' });
  });

  it.each([undefined, null, 18, '^18.2.0', 'latest', 'file:../react-18.2.0', 'https://host/18.2.0.tgz', '18.2.0oops'])('keeps invalid installed version %s unknown', (version) => {
    expect(versions(parsePackageLock(JSON.stringify({ dependencies: { react: { version } } })))).toEqual([['react', null]]);
  });
});

describe('pnpm-lock.yaml', () => {
  it.each([
    ['9.0', 'react@18.3.1', '@angular/core@18.2.0'],
    ['6.0', '/react@18.3.1', '/@angular/core@18.2.0'],
    ['5.4', '/react/18.3.1', '/@angular/core/18.2.0'],
  ])('reads v%s resolved package keys only', (version, react, angular) => {
    const result = parsePnpmLock(`lockfileVersion: '${version}'
importers:
  .:
    dependencies:
      vue: {specifier: ^3, version: 3.5.0}
packages:
  '${react}': {resolution: {integrity: sha512-example}}
  '${angular}(rxjs@7.8.1)': {}
  '${react}(typescript@5.6.3)': {}
  typescript@5.6.3: {}
  ignored@1.0.0: {}
snapshots:
  vue@3.5.0: {}
`);
    expect(versions(result)).toEqual([['react', '18.3.1'], ['angular', '18.2.0'], [null, '5.6.3']]);
    expect(result[0].source).toBe('pnpm-lock.yaml');
    expect(result[2].productLabel).toBe('TypeScript');
  });
  it('handles v5 peer suffixes and keeps distinct installed versions', () => {
    expect(versions(parsePnpmLock('packages:\n  /react/17.0.2: {}\n  /react/18.2.0_typescript@5.6.3: {}\n  /vue/file:../vue: {}\n'))).toEqual([['react', '17.0.2'], ['react', '18.2.0'], ['vue', null]]);
  });
});

describe('yarn.lock', () => {
  it('reads classic multi-selectors and scoped names using resolved version lines', () => {
    const result = parseYarnLock(`# yarn lockfile v1

react@^18.0.0, react@~18.3.0:
  version "18.3.1"
  resolved "https://registry.yarnpkg.com/react/-/react-18.3.1.tgz"
  dependencies:
    vue "^3.0.0"

"@angular/core@^18", "@angular/core@~18.2":
  version "18.2.0"

react@^17:
  version "17.0.2"

typescript@^5:
  version "5.6.3"

vue@^3:
  resolved "https://host/vue-3.0.0.tgz"
`);
    expect(versions(result)).toEqual([['react', '18.3.1'], ['angular', '18.2.0'], ['react', '17.0.2'], [null, '5.6.3'], ['vue', null]]);
    expect(result[0].source).toBe('yarn.lock');
    expect(result[3].productLabel).toBe('TypeScript');
  });
  it('reads Berry YAML, ignores metadata, and never falls back to descriptor ranges', () => {
    expect(versions(parseYarnLock(`__metadata:
  version: 8
"react@npm:^18, react@npm:~18.3":
  version: 18.3.1
  resolution: "react@npm:18.3.1"
"@angular/core@npm:^18":
  version: 18.2.0
"react@npm:18.3.1":
  version: 18.3.1
"vue@npm:^3":
  version: "^3.5.0"
`))).toEqual([['react', '18.3.1'], ['angular', '18.2.0'], ['vue', null]]);
  });
});

for (const parse of [parsePackageLock, parsePnpmLock, parseYarnLock]) {
  it.each(['', 'null', '[]', '42', '{broken', 'packages: [', '{"dependencies":{"react":null}}'])(`${parse.name} handles malformed/irrelevant input %s`, (input) => {
    expect(() => parse(input)).not.toThrow();
    expect(parse(input)).toEqual([]);
  });
}

describe('lockfile aliases use actual package identities', () => {
  it('prefers npm package record names over installation aliases', () => {
    const result = parsePackageLock(JSON.stringify({ packages: {
      'node_modules/react': { name: 'preact', version: '10.27.0' },
      'node_modules/alias': { name: 'react', version: '18.3.1' },
      'node_modules/wrapper/node_modules/@scope/alias': { name: '@angular/core', version: '18.2.0' },
      'node_modules/react-copy': { name: 'react', version: '18.3.1' },
      'node_modules/typescript-copy': { name: 'typescript', version: '5.6.3' },
      'node_modules/vue': { name: 42, version: '3.5.0' },
    } }));
    expect(versions(result)).toEqual([['react', '18.3.1'], ['angular', '18.2.0'], [null, '5.6.3'], ['vue', '3.5.0']]);
    expect(result[0].label).toBe('react 18.3.1');
    expect(result[2].productLabel).toBe('TypeScript');
  });

  it.each(['classic', 'Berry'])('resolves npm aliases in %s selectors, including scoped targets and multiple selectors', (format) => {
    const field = (version: string) => format === 'classic' ? `  version "${version}"` : `  version: "${version}"`;
    const selectors = format === 'classic' ? '"alias@npm:react@^18", "react@^18"' : '"alias@npm:react@^18, react@^18"';
    expect(versions(parseYarnLock(`"react@npm:preact@^10":
${field('10.27.0')}
${selectors}:
${field('18.3.1')}
"@scope/alias@npm:@angular/core@^18":
${field('18.2.0')}
"ts@npm:typescript@^5":
${field('5.6.3')}
`))).toEqual([['react', '18.3.1'], ['angular', '18.2.0'], [null, '5.6.3']]);
  });

  it('prefers Berry resolution identities over outer selector names', () => {
    expect(versions(parseYarnLock(`"react@npm:^10":
  version: 10.27.0
  resolution: "preact@npm:10.27.0"
"alias@npm:^18":
  version: 18.3.1
  resolution: "react@npm:18.3.1"
"scoped-alias@npm:^18":
  version: 18.2.0
  resolution: "@angular/core@npm:18.2.0"
`))).toEqual([['react', '18.3.1'], ['angular', '18.2.0']]);
  });

  it.each([
    ['preact@10.27.0', 'react@18.3.1'],
    ['/preact@10.27.0', '/react@18.3.1'],
    ['/preact/10.27.0', '/react/18.3.1'],
  ])('uses pnpm actual package keys %s and %s despite importer aliases', (preact, react) => {
    expect(versions(parsePnpmLock(`importers:
  .:
    dependencies:
      react: {specifier: "npm:preact@^10", version: "preact@10.27.0"}
      alias: {specifier: "npm:react@^18", version: "react@18.3.1"}
packages:
  '${preact}': {}
  '${react}': {}
`))).toEqual([['react', '18.3.1']]);
  });
});
