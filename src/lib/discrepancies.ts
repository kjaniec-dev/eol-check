import intersects from 'semver/ranges/intersects.js';
import validRange from 'semver/ranges/valid.js';
import type { Component, CrossFileDiscrepancy, DiscrepancyResult } from './types.ts';

const COMPARABLE_BASES = new Set(['declared', 'lockfile', 'image-reference']);

function scopeValue(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function declarationRange(component: Component): string | null {
  if (component.versionRange !== undefined) return validRange(component.versionRange);
  if (!component.version) return null;
  if (component.versionBasis !== undefined && !COMPARABLE_BASES.has(component.versionBasis))
    return null;
  if (!/^\d+(?:\.\d+)*$/.test(component.version)) return null;

  const parts = component.version.split('.');
  return parts.length < 3 ? `${component.version}.x` : validRange(component.version);
}

function sameInput(left: Component, right: Component): boolean {
  if (left.inputId !== undefined && right.inputId !== undefined) {
    return left.inputId === right.inputId;
  }
  return left.source === right.source;
}

function rawDeclaration(component: Component): string {
  return component.versionRange ?? component.version ?? component.label;
}

function compareDeclarations(left: Component, right: Component): DiscrepancyResult {
  const leftRange = declarationRange(left);
  const rightRange = declarationRange(right);
  if (!leftRange || !rightRange) return 'unknown';
  return intersects(leftRange, rightRange) ? 'compatible' : 'conflict';
}

function explanation(result: DiscrepancyResult): string {
  switch (result) {
    case 'conflict':
      return 'The declared version constraints do not overlap.';
    case 'compatible':
      return 'The declarations differ but allow at least one common version.';
    case 'unknown':
      return 'These declaration formats cannot be safely compared.';
  }
}

export function findDiscrepancies(components: Component[]): CrossFileDiscrepancy[] {
  const groups = new Map<string, Component[]>();
  for (const component of components) {
    if (!component.product) continue;
    const application = scopeValue(component.application, 'root');
    const environment = scopeValue(component.environment, 'default');
    const key = JSON.stringify([application, environment, component.product]);
    const group = groups.get(key);
    if (group) group.push(component);
    else groups.set(key, [component]);
  }

  const discrepancies: CrossFileDiscrepancy[] = [];
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const left = group[i]!;
        const right = group[j]!;
        if (sameInput(left, right)) continue;

        const result = compareDeclarations(left, right);
        if (rawDeclaration(left) === rawDeclaration(right) && result !== 'unknown') continue;
        discrepancies.push({
          product: left.product!,
          productLabel: left.productLabel ?? right.productLabel ?? left.product!,
          application: scopeValue(left.application, 'root'),
          environment: scopeValue(left.environment, 'default'),
          left,
          right,
          result,
          explanation: explanation(result),
        });
      }
    }
  }
  return discrepancies;
}
