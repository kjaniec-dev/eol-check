import type { Component } from '../types.ts';
import { CODENAMES, DOCKER_IMAGES } from '../mapping.ts';

const SOURCE = 'Dockerfile';

/** Docker joins escaped newlines before interpreting instructions. */
function instructions(text: string): string[] {
  const lines: string[] = [];
  let pending = '';
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*(?:#|$)/.test(raw)) continue;
    const line = pending + raw.trimStart();
    if (/\\\s*$/.test(line)) {
      pending = line.replace(/\\\s*$/, '');
    } else {
      lines.push(line);
      pending = '';
    }
  }
  if (pending) lines.push(pending);
  return lines;
}

/** Keep unresolved substitutions intact so a numeric prefix cannot look pinned. */
function expand(value: string, args: Map<string, string>, unquote = false, depth = 0): string {
  if (depth > 20) return value;
  let result = '';
  let quote = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (unquote && (char === '"' || char === "'")) {
      if (!quote) { quote = char; continue; }
      if (quote === char) { quote = ''; continue; }
    }
    if (char !== '$' || quote === "'") { result += char; continue; }

    if (value[i + 1] !== '{') {
      const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(value.slice(i + 1))?.[0];
      result += name ? (args.get(name) ?? `$${name}`) : char;
      if (name) i += name.length;
      continue;
    }

    let end = i + 2;
    let nesting = 1;
    for (; end < value.length; end++) {
      if (value[end] === '{') nesting++;
      if (value[end] === '}' && --nesting === 0) break;
    }
    const original = value.slice(i, end + 1);
    const expression = /^([A-Za-z_][A-Za-z0-9_]*)(?:(:-|-)([\s\S]*))?$/.exec(value.slice(i + 2, end));
    if (end === value.length || !expression) {
      result += original;
    } else {
      const [, name, modifier, fallback] = expression;
      const existing = args.get(name!);
      const useFallback = modifier && (existing === undefined || (modifier === ':-' && existing === ''));
      result += useFallback ? expand(fallback!, args, unquote, depth + 1) : (existing ?? original);
    }
    i = end;
  }
  return result;
}

/** Strips registry host and the implicit "library/" namespace. */
function normalizeImage(ref: string): string {
  const parts = ref.split('/');
  if (parts.length > 1 && /[.:]/.test(parts[0]!)) parts.shift();
  if (parts[0] === 'library') parts.shift();
  return parts.join('/');
}

function versionFromTag(image: string, tag: string): string | null {
  const codename = CODENAMES[image]?.[tag.split('-')[0]!];
  if (codename) return codename;
  const m = /^v?(\d+(?:\.\d+)*)/.exec(tag);
  return m ? m[1]! : null;
}

export function parseDockerfile(text: string): Component[] {
  const out: Component[] = [];
  const aliases = new Set<string>();
  const args = new Map<string, string>();
  let inStage = false;

  for (const raw of instructions(text)) {
    if (!inStage) {
      const arg = /^\s*ARG\s+([A-Za-z_][A-Za-z0-9_]*)(?:=([\s\S]*))?\s*$/i.exec(raw);
      if (arg) {
        if (arg[2] !== undefined) args.set(arg[1]!, expand(arg[2].trim(), args, true));
        continue;
      }
    }
    const m = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i.exec(raw);
    if (!m) continue;
    inStage = true;
    const [, label, alias] = m;
    const ref = expand(label!, args);
    const isStageRef = aliases.has(ref.toLowerCase());
    if (alias) aliases.add(alias.toLowerCase());
    if (ref.toLowerCase() === 'scratch' || isStageRef) continue;

    const [withoutDigest] = ref.split('@');
    const colon = withoutDigest!.lastIndexOf(':');
    const hasTag = colon > withoutDigest!.lastIndexOf('/');
    const name = normalizeImage(hasTag ? withoutDigest!.slice(0, colon) : withoutDigest!);
    const tag = hasTag ? withoutDigest!.slice(colon + 1) : null;
    const product = DOCKER_IMAGES[name] ?? null;

    out.push({
      source: SOURCE,
      kind: 'image',
      label: label!,
      product,
      version: tag && !tag.includes('$') ? versionFromTag(name, tag) : null,
    });
  }
  return out;
}
