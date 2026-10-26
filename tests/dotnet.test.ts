import { describe, expect, it } from 'vitest';
import { parseDotnetJson, parseDotnetXml } from '../src/lib/parsers/dotnet.ts';

describe('.NET manifests', () => {
  it('normalizes SDK feature bands while retaining the declared SDK label', () => {
    expect(parseDotnetJson('{"sdk":{"version":"8.0.404"}}')).toEqual([
      expect.objectContaining({
        source: 'global.json',
        product: 'dotnet',
        version: '8.0',
        label: expect.stringContaining('8.0.404'),
      }),
    ]);
  });
  it('reads singular and plural runtime frameworks', () => {
    const out = parseDotnetJson(
      JSON.stringify({
        runtimeOptions: {
          framework: { name: 'Microsoft.NETCore.App', version: '8.0.11' },
          frameworks: [
            { name: 'Microsoft.AspNetCore.App', version: '9.0.1' },
            { name: 'Other', version: '1.2' },
          ],
        },
      }),
    );
    expect(out.map((c) => [c.source, c.product, c.version])).toEqual([
      ['runtimeconfig.json', 'dotnet', '8.0'],
      ['runtimeconfig.json', 'dotnet', '9.0'],
      ['runtimeconfig.json', null, '1.2'],
    ]);
  });
  it('reads modern and unsupported TFMs from projects and props', () => {
    const out = parseDotnetXml(
      '<Project><PropertyGroup><TargetFrameworks>net8.0; net9.0-windows;netstandard2.0;net48;$(Target)</TargetFrameworks></PropertyGroup></Project>',
      'repo/Directory.Build.props',
    );
    expect(out.map((c) => [c.source, c.product, c.version])).toEqual([
      ['Directory.Build.props', 'dotnet', '8.0'],
      ['Directory.Build.props', 'dotnet', '9.0'],
      ['Directory.Build.props', null, '2.0'],
      ['Directory.Build.props', null, '4.8'],
      ['Directory.Build.props', null, null],
    ]);
    expect(out[2]?.productLabel).toBe('.NET Standard');
    expect(out[3]?.productLabel).toBe('.NET Framework');
    expect(parseDotnetXml('<TargetFramework>net8.0</TargetFramework>')[0]?.source).toBe(
      'project.csproj',
    );
  });
  it('does not read commented properties and handles invalid JSON or dynamic SDK versions', () => {
    expect(parseDotnetXml('<!-- <TargetFramework>net6.0</TargetFramework> -->')).toEqual([]);
    expect(parseDotnetJson('broken')).toEqual([]);
    expect(parseDotnetJson('null')).toEqual([]);
    expect(parseDotnetJson('{"sdk":{"version":"latest"}}')[0]?.version).toBeNull();
  });
});

it.each(['1.0.4', '2.1.202', '8.0.100-preview.1'])(
  'keeps SDK %s lifecycle unknown and preserves its declaration',
  (version) => {
    expect(parseDotnetJson(JSON.stringify({ sdk: { version } }))).toEqual([
      expect.objectContaining({
        source: 'global.json',
        product: 'dotnet',
        version: null,
        label: expect.stringContaining(version),
      }),
    ]);
  },
);
it('uses actual legacy runtime framework versions without SDK mapping restrictions', () => {
  expect(
    parseDotnetJson(
      '{"runtimeOptions":{"framework":{"name":"Microsoft.NETCore.App","version":"2.1.30"}}}',
    )[0],
  ).toMatchObject({ product: 'dotnet', version: '2.1' });
});
it('does not assign preview runtime frameworks to stable lifecycle cycles', () => {
  expect(
    parseDotnetJson(
      '{"runtimeOptions":{"framework":{"name":"Microsoft.NETCore.App","version":"8.0.0-rc.1"}}}',
    )[0],
  ).toMatchObject({ product: 'dotnet', version: null });
});
it('normalizes stable SDK versions from 3 onward', () => {
  expect(parseDotnetJson('{"sdk":{"version":"3.1.426"}}')[0]).toMatchObject({
    product: 'dotnet',
    version: '3.1',
  });
});
