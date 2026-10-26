import { describe, expect, it } from 'vitest';
import { parseRuntimeFile } from '../src/lib/parsers/runtime-files.ts';

describe('runtime version files', () => {
  it.each(['.nvmrc', '.node-version'])('reads numeric Node pins from %s', (name) => {
    expect(parseRuntimeFile('v22.4.0\n', `app/${name}`)).toEqual([
      expect.objectContaining({
        source: name,
        product: 'nodejs',
        version: '22.4.0',
        kind: 'runtime',
      }),
    ]);
    expect(parseRuntimeFile('22', name)[0]?.version).toBe('22');
  });
  it.each(['lts/*', 'lts/jod', 'node', 'system', 'latest', '22.x'])(
    'keeps alias %s unknown',
    (value) => {
      expect(parseRuntimeFile(value, '.nvmrc')[0]).toMatchObject({
        product: 'nodejs',
        version: null,
      });
    },
  );
  it('reads Ruby and asdf runtime entries with comments and multiple versions', () => {
    expect(parseRuntimeFile('3.3.1', '.ruby-version')[0]).toMatchObject({
      product: 'ruby',
      version: '3.3.1',
    });
    const out = parseRuntimeFile(
      '# runtimes\nnodejs 22.4.0\npython 3.12.1 3.11.9 # fallback\ngolang 1.22.2\nruby 3.3.0\njava temurin-21.0.2\ndotnet 8.0.404\nunknown 1',
      'a/.tool-versions',
    );
    expect(out.map((c) => [c.product, c.version])).toEqual([
      ['nodejs', '22.4.0'],
      ['python', '3.12.1'],
      ['python', '3.11.9'],
      ['go', '1.22.2'],
      ['ruby', '3.3.0'],
      [null, null],
      ['dotnet', '8.0'],
    ]);
    expect(out[5]?.productLabel).toBe('Java');
    expect(parseRuntimeFile('java 21', '.tool-versions')[0]).toMatchObject({
      product: null,
      productLabel: 'Java',
      version: '21',
    });
  });
  it('reads mise strings, arrays and inline version objects', () => {
    const out = parseRuntimeFile(
      '[tools]\nnode = "22"\npython = ["3.12", "latest"]\ngo = { version = "1.23" }\njava = "21"\n[env]\nruby = "3.3"',
      'config/.mise.toml',
    );
    expect(out.map((c) => [c.source, c.product, c.version])).toEqual([
      ['.mise.toml', 'nodejs', '22'],
      ['.mise.toml', 'python', '3.12'],
      ['.mise.toml', 'python', null],
      ['.mise.toml', 'go', '1.23'],
      ['.mise.toml', null, '21'],
    ]);
  });
  it('ignores empty, unsupported and malformed inputs', () => {
    expect(parseRuntimeFile('', '.nvmrc')).toEqual([]);
    expect(parseRuntimeFile('22', 'README')).toEqual([]);
    expect(parseRuntimeFile('[tools]\nnode = "', 'mise.toml')).toEqual([]);
  });
});

it('ignores tool names inherited from Object.prototype', () => {
  expect(parseRuntimeFile('constructor 22\ntoString 17\n__proto__ 1', '.tool-versions')).toEqual(
    [],
  );
});
it('handles Windows paths and mise version objects within arrays', () => {
  expect(
    parseRuntimeFile(
      '[tools]\nnode = [{version = "22"}, {version = "lts/*"}]',
      'C:\\app\\mise.toml',
    ).map((c) => [c.source, c.version]),
  ).toEqual([
    ['mise.toml', '22'],
    ['mise.toml', null],
  ]);
});

it.each(['1.0.4', '2.1.202', '8.0.100-preview.1'])(
  'keeps SDK %s unknown across asdf and mise declarations',
  (version) => {
    for (const [text, filename] of [
      [`dotnet ${version}`, '.tool-versions'],
      [`[tools]\ndotnet = "${version}"`, 'mise.toml'],
      [`[tools]\ndotnet = { version = "${version}" }`, '.mise.toml'],
    ]) {
      expect(parseRuntimeFile(text!, filename!)).toEqual([
        expect.objectContaining({
          source: filename,
          product: 'dotnet',
          version: null,
          label: expect.stringContaining(version),
        }),
      ]);
    }
  },
);
it('normalizes stable mise SDK declarations to their runtime cycle', () => {
  expect(parseRuntimeFile('[tools]\ndotnet = "8.0.404"', 'mise.toml')[0]).toMatchObject({
    product: 'dotnet',
    version: '8.0',
  });
});
