import { parse as parseYaml } from 'yaml';
import valid from 'semver/functions/valid.js';
import { NPM_PACKAGES } from '../mapping.ts';
import type { Component } from '../types.ts';

function isMapping(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function read(text: string, json = false): Record<string, unknown> {
  try {
    const value: unknown = json ? JSON.parse(text) : parseYaml(text);
    return isMapping(value) ? value : {};
  } catch {
    return {};
  }
}

/** Installed versions must be exact: never infer versions from ranges or URLs. */
function installedVersion(value: unknown): string | null {
  return typeof value === 'string' && /^\d/.test(value) && valid(value) ? value : null;
}

function collector(source: string) {
  const components: Component[] = [];
  const seen = new Set<string>();
  return {
    components,
    add(name: string, rawVersion: unknown) {
      if (!Object.hasOwn(NPM_PACKAGES, name)) return;
      const product = NPM_PACKAGES[name];
      const version = installedVersion(rawVersion);
      const key = JSON.stringify([product, name, version]);
      if (seen.has(key)) return;
      seen.add(key);
      components.push({
        source,
        kind: 'framework',
        label: `${name} ${version ?? 'unknown'}`,
        product,
        version,
        versionBasis: 'lockfile',
        ...(name === 'typescript' ? { productLabel: 'TypeScript' } : {}),
      });
    },
  };
}

/** npm v1 dependency trees and npm v2/v3 installed package records. */
export function parsePackageLock(text: string): Component[] {
  const doc = read(text, true);
  const out = collector('package-lock.json');
  if (isMapping(doc.packages)) {
    for (const [path, entry] of Object.entries(doc.packages)) {
      // The last node_modules segment identifies nested and scoped packages.
      const name = path.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/)?.[1];
      if (name && isMapping(entry))
        out.add(typeof entry.name === 'string' ? entry.name : name, entry.version);
    }
  } else {
    const pending = isMapping(doc.dependencies) ? Object.entries(doc.dependencies).reverse() : [];
    while (pending.length) {
      const [name, entry] = pending.pop()!;
      if (!isMapping(entry)) continue;
      out.add(name, entry.version);
      if (isMapping(entry.dependencies)) {
        for (const child of Object.entries(entry.dependencies).reverse()) pending.push(child);
      }
    }
  }
  return out.components;
}

/** pnpm stores resolved versions in packages keys; snapshots repeat them. */
export function parsePnpmLock(text: string): Component[] {
  const doc = read(text);
  const out = collector('pnpm-lock.yaml');
  if (!isMapping(doc.packages)) return [];
  for (const key of Object.keys(doc.packages)) {
    const match = key.match(/^\/?((?:@[^/@]+\/)?[^/@]+)(?:@|\/)(.+)$/);
    if (!match) continue;
    // v5 uses underscore peer suffixes; newer formats use parentheses.
    out.add(match[1], match[2].split(/[(_]/, 1)[0]);
  }
  return out.components;
}

function descriptorName(descriptor: string): string | null {
  const match = descriptor.match(/^((?:@[^/@\s]+\/)?[^/@\s]+)@(.+)$/);
  if (!match) return null;
  // npm:react@^18 is an alias target; npm:^18 is an ordinary descriptor.
  const target = match[2].startsWith('npm:')
    ? match[2].slice(4).match(/^((?:@[^/@\s]+\/)?[^/@\s]+)@/)?.[1]
    : undefined;
  return target ?? match[1];
}

function selectorNames(selectors: string): string[] {
  return selectors.split(/,\s*/).flatMap((selector) => {
    const name = descriptorName(selector.trim().replace(/^["']|["']$/g, ''));
    return name ? [name] : [];
  });
}

/** Berry uses YAML; classic uses a deliberately small, non-evaluating line reader. */
export function parseYarnLock(text: string): Component[] {
  const out = collector('yarn.lock');
  // A classic version field has no colon. Do not fall back for malformed Berry YAML.
  if (!/^ {2}version\s+[^:\s]/m.test(text)) {
    for (const [selectors, entry] of Object.entries(read(text))) {
      if (selectors === '__metadata' || !isMapping(entry)) continue;
      const resolvedName =
        typeof entry.resolution === 'string' ? descriptorName(entry.resolution) : null;
      const names = resolvedName ? [resolvedName] : selectorNames(selectors);
      for (const name of names) out.add(name, entry.version);
    }
    return out.components;
  }

  let names: string[] = [];
  let version: unknown;
  const flush = () => {
    for (const name of names) out.add(name, version);
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (/^\S/.test(line)) {
      flush();
      names = line.endsWith(':') ? selectorNames(line.slice(0, -1)) : [];
      version = undefined;
    } else {
      const match = line.match(
        /^ {2}version\s+(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s#]+))\s*(?:#.*)?$/,
      );
      if (match) version = match[1] ?? match[2] ?? match[3];
    }
  }
  flush();
  return out.components;
}
