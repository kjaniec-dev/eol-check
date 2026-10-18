import type { Component } from '../types.ts';
import { CODENAMES, DOCKER_IMAGES } from '../mapping.ts';

const SOURCE = 'Dockerfile';

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

  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i.exec(raw);
    if (!m) continue;
    const [, ref, alias] = m;
    const isStageRef = aliases.has(ref!.toLowerCase());
    if (alias) aliases.add(alias.toLowerCase());
    if (ref!.toLowerCase() === 'scratch' || isStageRef) continue;

    const [withoutDigest] = ref!.split('@');
    const colon = withoutDigest!.lastIndexOf(':');
    const hasTag = colon > withoutDigest!.lastIndexOf('/');
    const name = normalizeImage(hasTag ? withoutDigest!.slice(0, colon) : withoutDigest!);
    const tag = hasTag ? withoutDigest!.slice(colon + 1) : null;
    const product = DOCKER_IMAGES[name] ?? null;

    out.push({
      source: SOURCE,
      kind: 'image',
      label: ref!,
      product,
      version: tag && !tag.includes('$') ? versionFromTag(name, tag) : null,
    });
  }
  return out;
}
