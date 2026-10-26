import { parse } from 'yaml';
import type { Component } from '../types.ts';
import { parseImageReference } from './dockerfile.ts';

function isMapping(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function services(text: string): Record<string, unknown> | null {
  if (!text.trimStart().startsWith('{') && !/^\s*["']?services["']?\s*:/m.test(text)) return null;
  try {
    const doc: unknown = parse(text, { merge: true, stringKeys: true });
    return isMapping(doc) && isMapping(doc.services) ? doc.services : null;
  } catch {
    return null;
  }
}

export function isCompose(text: string): boolean {
  return services(text) !== null;
}

export function parseCompose(text: string): Component[] {
  return Object.values(services(text) ?? {}).flatMap((service) => {
    if (!isMapping(service) || typeof service.image !== 'string' || !service.image.trim())
      return [];
    return parseImageReference(service.image.trim(), 'compose.yaml');
  });
}
