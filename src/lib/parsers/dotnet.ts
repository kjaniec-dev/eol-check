import type { Component } from '../types.ts';

function table(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cycle(value: string): string | null {
  return /^(\d+\.\d+)(?:\.\d+)*$/.exec(value)?.[1] ?? null;
}

/** SDK/runtime numbering aligns from SDK 3 onward; legacy mappings need an explicit lookup.
 * Prereleases cannot inherit stable runtime support guarantees.
 */
export function normalizeDotnetSdkVersion(value: string): string | null {
  const numeric = /^v?(\d+(?:\.\d+)*)$/.exec(value)?.[1];
  if (!numeric || Number(numeric.split('.')[0]) < 3) return null;
  return numeric.split('.').slice(0, 2).join('.');
}

/** global.json SDKs and runtimeconfig.json framework declarations. */
export function parseDotnetJson(text: string): Component[] {
  let doc: Record<string, unknown>;
  try {
    doc = table(JSON.parse(text));
  } catch {
    return [];
  }
  const out: Component[] = [];
  const sdk = table(doc.sdk).version;
  if (typeof sdk === 'string')
    out.push({
      source: 'global.json',
      kind: 'runtime',
      label: `.NET SDK ${sdk}`,
      product: 'dotnet',
      version: normalizeDotnetSdkVersion(sdk),
    });
  const options = table(doc.runtimeOptions);
  const frameworks = [
    options.framework,
    ...(Array.isArray(options.frameworks) ? options.frameworks : []),
  ];
  for (const value of frameworks) {
    const framework = table(value);
    if (typeof framework.name !== 'string' || typeof framework.version !== 'string') continue;
    const known = [
      'Microsoft.NETCore.App',
      'Microsoft.AspNetCore.App',
      'Microsoft.WindowsDesktop.App',
    ].includes(framework.name);
    out.push({
      source: 'runtimeconfig.json',
      kind: 'runtime',
      label: `${framework.name} ${framework.version}`,
      product: known ? 'dotnet' : null,
      productLabel: known ? '.NET' : framework.name,
      version: known
        ? cycle(framework.version)
        : /^\d+(?:\.\d+)*$/.test(framework.version)
          ? framework.version
          : null,
    });
  }
  return out;
}

/** Read literal TFMs without evaluating MSBuild properties, conditions or imports. */
export function parseDotnetXml(text: string, source = 'project.csproj'): Component[] {
  source = source.split(/[\\/]/).pop()!;
  const out: Component[] = [];
  const clean = text.replace(/<!--[\s\S]*?-->/g, '');
  for (const match of clean.matchAll(/<\s*(TargetFrameworks?)\b[^>]*>([^<]*)<\/\s*\1\s*>/g)) {
    for (const tfm of match[2]!
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean)) {
      const modern = /^net(\d+)\.(\d+)(?:-[a-zA-Z0-9.-]+)?$/.exec(tfm);
      const standard = /^netstandard(\d+\.\d+)$/.exec(tfm);
      const framework = /^net(\d{2,3})$/.exec(tfm);
      const known = modern && Number(modern[1]) >= 5;
      const version = known
        ? `${modern[1]}.${modern[2]}`
        : (standard?.[1] ?? (framework ? framework[1]!.split('').join('.') : null));
      const productLabel = standard ? '.NET Standard' : framework ? '.NET Framework' : '.NET';
      out.push({
        source,
        kind: 'runtime',
        label: `${productLabel} ${tfm}`,
        product: known ? 'dotnet' : null,
        productLabel,
        version,
      });
    }
  }
  return out;
}
