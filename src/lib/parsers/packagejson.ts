import type { Component } from '../types.ts';
import { NODE, NPM_PACKAGES } from '../mapping.ts';
import Range from 'semver/classes/range.js';
import semverMinVersion from 'semver/ranges/min-version.js';
import compare from 'semver/functions/compare.js';

const SOURCE = 'package.json';

/** Minimum admitted by an npm range; upper-only and unbounded ranges stay unknown. */
export function minVersion(range: string): string | null {
  try {
    const parsed = new Range(range);
    let minimum: ReturnType<typeof semverMinVersion> = null;
    for (const comparators of parsed.set) {
      // Ignore impossible OR branches, but do not invent 0.0.0 for an unbounded one.
      const candidate = semverMinVersion(comparators.map((c) => c.value).join(' '));
      if (!candidate) continue;
      const hasLowerBound = comparators.some((c) =>
        c.operator === '>=' || c.operator === '>' || (c.operator === '' && c.value !== ''));
      if (!hasLowerBound) return null;
      if (!minimum || compare(candidate, minimum) < 0) minimum = candidate;
    }
    return minimum?.version ?? null;
  } catch {
    return null;
  }
}

export function parsePackageJson(text: string): Component[] {
  let pkg: Record<string, any>;
  try {
    pkg = JSON.parse(text);
  } catch {
    return [];
  }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return [];
  const out: Component[] = [];

  const node = pkg.engines?.node;
  if (typeof node === 'string') {
    out.push({ source: SOURCE, kind: 'runtime', label: `node ${node}`, product: NODE, version: minVersion(node) });
  }

  const deps: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  };
  for (const [name, range] of Object.entries(deps)) {
    const product = NPM_PACKAGES[name];
    if (!Object.hasOwn(NPM_PACKAGES, name) || typeof range !== 'string') continue;
    out.push({
      source: SOURCE, kind: 'framework', label: `${name} ${range}`,
      product: product ?? null, version: minVersion(range),
      ...(name === 'typescript' ? { productLabel: 'TypeScript' } : {}),
    });
  }
  return out;
}
