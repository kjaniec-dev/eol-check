import { parse } from 'smol-toml';
import type { Component } from '../types.ts';
import { normalizeDotnetSdkVersion } from './dotnet.ts';

const TOOLS: Record<string, [string | null, string]> = {
  node: ['nodejs', 'Node.js'], nodejs: ['nodejs', 'Node.js'], python: ['python', 'Python'],
  go: ['go', 'Go'], golang: ['go', 'Go'], ruby: ['ruby', 'Ruby'],
  java: [null, 'Java'], dotnet: ['dotnet', '.NET'],
};

function runtime(tool: string, declared: string, source: string): Component | null {
  const entry = Object.prototype.hasOwnProperty.call(TOOLS, tool) ? TOOLS[tool] : undefined;
  if (!entry) return null;
  const [product, productLabel] = entry;
  const numeric = /^v?(\d+(?:\.\d+)*)$/.exec(declared)?.[1] ?? null;
  const version = product === 'dotnet' ? normalizeDotnetSdkVersion(declared) : numeric;
  return { source, kind: 'runtime', label: `${productLabel} ${declared}`, product, productLabel, version };
}

/** Parse declarations only; aliases and vendor-specific Java identifiers are not resolved. */
export function parseRuntimeFile(text: string, filename: string): Component[] {
  const source = filename.split(/[\\/]/).pop()!;
  const out: Component[] = [];
  const add = (tool: string, value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return;
    const component = runtime(tool, value.trim(), source);
    if (component) out.push(component);
  };
  if (source === 'mise.toml' || source === '.mise.toml') {
    try {
      const tools = parse(text).tools;
      if (!tools || typeof tools !== 'object' || Array.isArray(tools)) return [];
      for (const [tool, value] of Object.entries(tools)) {
        for (const item of Array.isArray(value) ? value : [value]) {
          add(tool, item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>).version : item);
        }
      }
    } catch { return []; }
    return out;
  }
  const lines = text.split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim()).filter(Boolean);
  if (source === '.tool-versions') {
    for (const line of lines) {
      const [tool, ...values] = line.split(/\s+/);
      for (const value of values) add(tool!, value);
    }
  } else {
    const tool = source === '.nvmrc' || source === '.node-version' ? 'node'
      : source === '.ruby-version' ? 'ruby' : null;
    if (tool) for (const line of lines) add(tool, line);
  }
  return out;
}
