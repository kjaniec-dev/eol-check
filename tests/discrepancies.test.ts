import { describe, expect, it } from 'vitest';
import { findDiscrepancies } from '../src/lib/discrepancies.ts';
import { findingsToMarkdown } from '../src/lib/markdown.ts';
import { parseAny } from '../src/lib/parsers/index.ts';
import type { Component, Finding, Status } from '../src/lib/types.ts';

function parse(
  text: string,
  filename: string,
  options: { application?: string; environment?: string } = {},
): Component[] {
  const { components } = parseAny(text, filename);
  return components.map((component) => ({
    ...component,
    source: filename,
    inputId: filename,
    application: options.application ?? 'root',
    environment: options.environment ?? 'default',
  }));
}

function check(...inputs: Component[][]) {
  return findDiscrepancies(inputs.flat());
}

describe('cross-file discrepancies', () => {
  it('preserves npm ranges and distinguishes compatible declarations from conflicts', () => {
    const manifest = parse('{"engines":{"node":">=20 <23"}}', 'package.json');
    const pin = parse('22.4.1', '.nvmrc');
    const docker = parse('FROM node:18', 'Dockerfile');

    expect(manifest[0]?.versionRange).toBe('>=20 <23');
    const results = check(manifest, pin, docker);
    expect(results.map(({ result }) => result).sort()).toEqual([
      'compatible',
      'conflict',
      'conflict',
    ]);
  });

  it('compares npm OR and upper-only ranges without reducing them to their minimum', () => {
    const alternatives = parse('{"engines":{"node":"^18 || ^22"}}', 'package.json');
    const upperBound = parse('{"engines":{"node":"<20"}}', 'package.json');
    const version22 = parse('22.4.1', '.nvmrc');

    expect(check(alternatives, version22).map(({ result }) => result)).toEqual(['compatible']);
    expect(check(upperBound, version22).map(({ result }) => result)).toEqual(['conflict']);
  });

  it('treats a numeric major as a prefix constraint, but does not use computed minimums as pins', () => {
    const major = parse('22', '.nvmrc');
    const minor = parse('FROM node:22.4.1', 'Dockerfile');
    expect(check(major, minor).map(({ result }) => result)).toEqual(['compatible']);

    const minimum: Component = {
      source: 'pyproject.toml',
      inputId: 'pyproject.toml',
      application: 'root',
      environment: 'default',
      kind: 'runtime',
      label: 'Python >=3.11',
      product: 'python',
      version: '3.11.0',
      versionBasis: 'minimum',
    };
    const exact: Component = {
      ...minimum,
      source: '.python-version',
      inputId: '.python-version',
      label: 'Python 3.10',
      version: '3.10',
      versionBasis: 'declared',
    };
    expect(check([minimum], [exact]).map(({ result }) => result)).toEqual(['unknown']);
  });

  it('does not interpret Go minimums or .NET target frameworks as exact runtime pins', () => {
    const goMinimum = parse('go 1.23', 'go.mod');
    const goPin = parse('golang 1.21', '.tool-versions');
    const dotnetTarget = parse(
      '<Project><TargetFramework>net8.0</TargetFramework></Project>',
      'app.csproj',
    );
    const dotnetImage = parse('FROM mcr.microsoft.com/dotnet/runtime:8.0', 'Dockerfile');

    expect(goMinimum[0]?.versionBasis).toBe('minimum');
    expect(check(goMinimum, goPin).map(({ result }) => result)).toEqual(['unknown']);
    expect(dotnetTarget[0]?.versionBasis).toBe('target-framework');
    expect(check(dotnetTarget, dotnetImage).map(({ result }) => result)).toEqual(['unknown']);
  });

  it('does not compare within a file or across products, applications, or environments', () => {
    const first = parse('22', '.nvmrc');
    const sameProduct = parse('FROM node:18', 'Dockerfile');
    const otherApp = parse('16', 'services/other/.nvmrc', { application: 'services/other' });
    const otherEnv = parse('20', 'production/.nvmrc', { environment: 'production' });
    const otherProduct: Component = {
      ...sameProduct[0]!,
      source: 'python.version',
      inputId: 'python.version',
      product: 'python',
    };

    expect(check(first, sameProduct, otherApp, otherEnv, [otherProduct])).toHaveLength(1);
    expect(check(first, first)).toEqual([]);
  });

  it('exports comparisons with Markdown-escaped paths and grouping labels', () => {
    const first = parse('22', 'apps/a|b/.nvmrc', { application: 'a|b' });
    const second = parse('FROM node:18', 'apps/a|b/Dockerfile', { application: 'a|b' });
    const findings: Finding[] = [
      {
        component: first[0]!,
        status: 'ok',
        productLabel: 'Node.js',
        cycle: '22',
        eolFrom: null,
        note: null,
      },
    ];
    const labels: Record<Status, string> = {
      eol: 'EOL',
      soon: 'Soon',
      ok: 'OK',
      unknown: 'Unknown',
    };
    const markdown = findingsToMarkdown(findings, labels, check(first, second));

    expect(markdown).toContain('Cross-file version comparisons');
    expect(markdown).toContain('apps/a&#124;b/.nvmrc');
    expect(markdown).toContain('apps/a&#124;b/Dockerfile');
    expect(markdown).toContain('a&#124;b');
    expect(markdown).toContain('Conflict');
  });
});
