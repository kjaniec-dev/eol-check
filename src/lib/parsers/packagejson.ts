import type { Component } from '../types.ts';
import { NODE, NPM_PACKAGES } from '../mapping.ts';

const SOURCE = 'package.json';

/** Lowest version a semver range admits, e.g. ">=18 <21" -> "18", "^20.1.0" -> "20.1.0". */
export function minVersion(range: string): string | null {
  const m = /(\d+(?:\.\d+){0,2})/.exec(range);
  return m ? m[1]! : null;
}

export function parsePackageJson(text: string): Component[] {
  let pkg: Record<string, any>;
  try {
    pkg = JSON.parse(text);
  } catch {
    return [];
  }
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
    out.push({ source: SOURCE, kind: 'framework', label: `${name} ${range}`, product: product ?? null, version: minVersion(range) });
  }
  return out;
}
