import type { Component } from '../types.ts';
import { parseDockerfile } from './dockerfile.ts';
import { parseGoMod } from './gomod.ts';
import { parsePackageJson } from './packagejson.ts';
import { parsePomXml } from './pomxml.ts';

export type FileType = 'package.json' | 'pom.xml' | 'go.mod' | 'Dockerfile';

/** Content sniffing, so the user can just paste text without naming the file. */
export function detectFileType(text: string): FileType | null {
  const t = text.trimStart();
  if (t.startsWith('{')) return 'package.json';
  if (/<project[\s>]/.test(t)) return 'pom.xml';
  if (/^\s*FROM\s/im.test(t)) return 'Dockerfile';
  if (/^\s*(module\s|go\s+\d)/m.test(t)) return 'go.mod';
  return null;
}

export function parseAny(text: string): { type: FileType | null; components: Component[] } {
  const type = detectFileType(text);
  switch (type) {
    case 'package.json': return { type, components: parsePackageJson(text) };
    case 'pom.xml': return { type, components: parsePomXml(text) };
    case 'go.mod': return { type, components: parseGoMod(text) };
    case 'Dockerfile': return { type, components: parseDockerfile(text) };
    default: return { type, components: [] };
  }
}
