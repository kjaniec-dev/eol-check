import { parse } from 'smol-toml';
import type { Component } from '../types.ts';

function table(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** Minimum declared version, as with engines.node; upper bounds alone cannot identify a runtime. */
function minimumPythonVersion(range: string): string | null {
  if (range.includes('||')) return null;
  const bounds = range.trim().split(/\s*,\s*|\s+(?=[<>=!~^])/).map((bound) =>
    /^(>=|>|<=|<|!=|==|~=|\^|~)?\s*(\d+(?:\.\d+){0,2})(\.\*)?$/.exec(bound));
  if (bounds.some((bound) => !bound)) return null;
  const compare = (a: string, b: string) => {
    const left = a.split('.').map(Number);
    const right = b.split('.').map(Number);
    return Array.from({ length: Math.max(left.length, right.length) }, (_, i) =>
      (left[i] ?? 0) - (right[i] ?? 0)).find((n) => n !== 0) ?? 0;
  };
  let minimum: string | null = null;
  for (const bound of bounds) {
    const [, operator, version] = bound!;
    if (operator && !['>=', '==', '~=', '^', '~'].includes(operator)) continue;
    if (minimum === null || compare(version!, minimum) > 0) minimum = version!;
  }
  if (minimum === null) return null;
  const candidate = minimum;
  const valid = bounds.every((bound) => {
    const [, operator = '==', version, wildcard] = bound!;
    const order = compare(candidate, version!);
    const matches = wildcard ? candidate === version || candidate.startsWith(`${version}.`) : order === 0;
    switch (operator) {
      case '>=': return order >= 0;
      case '>': return order > 0;
      case '<=': return order <= 0;
      case '<': return order < 0;
      case '!=': return !matches;
      case '==': return matches;
      default: {
        const parts = version!.split('.').map(Number);
        const index = operator === '^' ? Math.max(0, parts.findIndex((n) => n !== 0))
          : operator === '~=' ? parts.length - 2 : Math.min(1, parts.length - 1);
        if (index < 0) return false;
        const upper = parts.slice(0, index + 1);
        upper[index] = upper[index]! + 1;
        return order >= 0 && compare(candidate, upper.join('.')) < 0;
      }
    }
  });
  return valid ? candidate : null;
}

export function parsePyproject(text: string): Component[] {
  let doc: Record<string, unknown>;
  try {
    doc = parse(text);
  } catch {
    return [];
  }
  const project = table(doc.project);
  const poetry = table(table(table(doc.tool).poetry).dependencies);
  const range = project['requires-python'] ?? poetry.python;
  if (typeof range !== 'string') return [];
  const version = minimumPythonVersion(range);
  return [{
    source: 'pyproject.toml', kind: 'runtime', label: `Python ${range.trim()}`,
    product: 'python', version, versionBasis: version === null ? 'range' : 'minimum',
  }];
}

export function parsePythonVersion(text: string): Component[] {
  const versions = text.split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim()).filter(Boolean);
  if (!versions.length || versions.some((version) => !/^\d+\.\d+(?:\.\d+)?$/.test(version))) return [];
  return versions.map((version) => ({
    source: '.python-version', kind: 'runtime', label: `Python ${version}`, product: 'python', version,
  }));
}

export function parseUvLock(text: string): Component[] {
  try {
    const doc = parse(text);
    const range = doc['requires-python'];
    if (typeof doc.version !== 'number' || typeof range !== 'string') return [];
    const version = minimumPythonVersion(range);
    return [{
      source: 'uv.lock', kind: 'runtime', label: `Python ${range.trim()}`,
      product: 'python', version, versionBasis: version === null ? 'range' : 'minimum',
    }];
  } catch {
    return [];
  }
}
