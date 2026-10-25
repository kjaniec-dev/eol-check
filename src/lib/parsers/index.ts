import type { Component } from '../types.ts';
import { parseDockerfile } from './dockerfile.ts';
import { parseGoMod } from './gomod.ts';
import { parsePackageJson } from './packagejson.ts';
import { parsePomXml } from './pomxml.ts';
import { parsePyproject, parsePythonVersion } from './python.ts';

export type FileType = 'package.json' | 'pom.xml' | 'go.mod' | 'Dockerfile' | 'pyproject.toml' | '.python-version';

/** Content sniffing, so the user can just paste text without naming the file. */
export function detectFileType(text: string): FileType | null {
  const t = text.trimStart();
  if (t.startsWith('{')) return 'package.json';
  if (/<project[\s>]/.test(t)) return 'pom.xml';
  if (/^\s*FROM\s/im.test(t)) return 'Dockerfile';
  if (/^\s*(module\s|go\s+\d)/m.test(t)) return 'go.mod';
  if (/^\s*\[\s*(?:project|build-system|tool\.poetry(?:\.[\w.-]+)?)\s*\]/m.test(t)) return 'pyproject.toml';
  if (parsePythonVersion(t).length) return '.python-version';
  return null;
}

export function parseAny(text: string): { type: FileType | null; components: Component[] } {
  const type = detectFileType(text);
  switch (type) {
    case 'package.json': return { type, components: parsePackageJson(text) };
    case 'pom.xml': return { type, components: parsePomXml(text) };
    case 'go.mod': return { type, components: parseGoMod(text) };
    case 'Dockerfile': return { type, components: parseDockerfile(text) };
    case 'pyproject.toml': return { type, components: parsePyproject(text) };
    case '.python-version': return { type, components: parsePythonVersion(text) };
    default: return { type, components: [] };
  }
}
