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

/** Shared image interpretation for Dockerfile and Compose. */
export function parseImageReference(ref: string, source: string, label = ref): Component[] {
  const [withoutDigest] = ref.split('@');
  const colon = withoutDigest!.lastIndexOf(':');
  const hasTag = colon > withoutDigest!.lastIndexOf('/');
  const repository = hasTag ? withoutDigest!.slice(0, colon) : withoutDigest!;
  let name = normalizeImage(repository);
  const tag = hasTag ? withoutDigest!.slice(colon + 1) : null;
  // Distroless pins runtime and OS cycles in the repository name, not the tag.
  const distroless = /^gcr\.io\/distroless\/(nodejs(\d+)|python3|java(\d+)|static|base|base-nossl|cc|java-base)-debian(\d+)$/.exec(repository);
  if (distroless) {
    const [, runtime, node, java, debian] = distroless;
    const out: Component[] = [];
    if (node) out.push({ source, kind: 'image', label, product: 'nodejs', version: node });
    if (runtime === 'python3') out.push({ source, kind: 'image', label, product: 'python', version: null });
    if (java) out.push({ source, kind: 'image', label, product: null, productLabel: 'Java', version: java });
    out.push({ source, kind: 'image', label, product: 'debian', version: debian! });
    return out;
  }
  if (repository.startsWith('cgr.dev/chainguard/')) {
    const image = repository.slice('cgr.dev/chainguard/'.length);
    name = image === 'go' ? 'golang' : image;
  }
  const bitnami = /^(?:(?:docker\.io|index\.docker\.io|registry-1\.docker\.io)\/|public\.ecr\.aws\/)?bitnami\/([^/]+)$/.exec(repository);
  if (bitnami) {
    const aliases: Record<string, string> = { postgresql: 'postgres', mongodb: 'mongo', apache: 'httpd', java: 'openjdk' };
    name = aliases[bitnami[1]!] ?? bitnami[1]!;
  }
  const ecrLibrary = /^public\.ecr\.aws\/docker\/library\/([^/]+)$/.exec(repository);
  if (ecrLibrary) name = ecrLibrary[1]!;
  if (repository === 'public.ecr.aws/amazoncorretto/amazoncorretto') name = 'amazoncorretto';
  const lambda = /^public\.ecr\.aws\/lambda\/(nodejs|python|ruby|java|dotnet)$/.exec(repository);
  if (lambda) {
    const aliases: Record<string, string> = { nodejs: 'node', java: 'openjdk', dotnet: 'dotnet/runtime' };
    name = aliases[lambda[1]!] ?? lambda[1]!;
  }
  let version = tag && !/[$ {}]/.test(tag) ? versionFromTag(name, tag) : null;
  if (lambda?.[1] === 'dotnet' && version && /^\d+$/.test(version)) version += '.0';
  return [{
    source, kind: 'image', label, product: DOCKER_IMAGES[name] ?? null,
    version,
    ...(version && /^\d+$/.test(version) && tag && /^v?\d+(?:-[\w.-]+)?$/.test(tag) && !ref.includes('@')
      ? { floatingMajorTag: true as const } : {}),
  }];
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

    out.push(...parseImageReference(ref, SOURCE, label!));
  }
  return out;
}
