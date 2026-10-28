import type { Component } from '../types.ts';
import { parseDockerfile } from './dockerfile.ts';
import { isCompose, parseCompose } from './compose.ts';
import { isKubernetes, parseKubernetes } from './kubernetes.ts';
import { parseGoMod } from './gomod.ts';
import { parsePackageJson } from './packagejson.ts';
import { parsePomXml } from './pomxml.ts';
import { parsePyproject, parsePythonVersion, parseUvLock } from './python.ts';
import { parseRuntimeFile } from './runtime-files.ts';
import { parseDotnetJson, parseDotnetXml } from './dotnet.ts';
import { parseGradle } from './gradle.ts';
import { parseComposer, parseGemfileLock, parsePythonDependencies } from './ecosystems.ts';
import { parsePackageLock, parsePnpmLock, parseYarnLock } from './javascript-locks.ts';

export type FileType =
  | 'package.json'
  | 'package-lock.json'
  | 'pnpm-lock.yaml'
  | 'yarn.lock'
  | 'pom.xml'
  | 'go.mod'
  | 'Dockerfile'
  | 'pyproject.toml'
  | '.python-version'
  | 'uv.lock'
  | 'compose.yaml'
  | 'Kubernetes'
  | '.nvmrc'
  | '.node-version'
  | '.ruby-version'
  | '.tool-versions'
  | 'mise.toml'
  | 'global.json'
  | 'runtimeconfig.json'
  | '*.csproj'
  | 'Directory.Build.props'
  | 'build.gradle'
  | 'build.gradle.kts'
  | 'requirements.txt'
  | 'Pipfile.lock'
  | 'poetry.lock'
  | 'composer.json'
  | 'composer.lock'
  | 'Gemfile.lock';

function namedType(filename: string): FileType | null {
  const name = filename.split(/[\\/]/).pop()!.toLowerCase();
  const names: Record<string, FileType> = {
    'package.json': 'package.json',
    'package-lock.json': 'package-lock.json',
    'npm-shrinkwrap.json': 'package-lock.json',
    'pnpm-lock.yaml': 'pnpm-lock.yaml',
    'yarn.lock': 'yarn.lock',
    'pom.xml': 'pom.xml',
    'go.mod': 'go.mod',
    dockerfile: 'Dockerfile',
    'pyproject.toml': 'pyproject.toml',
    '.python-version': '.python-version',
    'uv.lock': 'uv.lock',
    'compose.yaml': 'compose.yaml',
    'compose.yml': 'compose.yaml',
    'docker-compose.yaml': 'compose.yaml',
    'docker-compose.yml': 'compose.yaml',
    '.nvmrc': '.nvmrc',
    '.node-version': '.node-version',
    '.ruby-version': '.ruby-version',
    '.tool-versions': '.tool-versions',
    'mise.toml': 'mise.toml',
    '.mise.toml': 'mise.toml',
    'global.json': 'global.json',
    'directory.build.props': 'Directory.Build.props',
    'build.gradle': 'build.gradle',
    'build.gradle.kts': 'build.gradle.kts',
    'requirements.txt': 'requirements.txt',
    'pipfile.lock': 'Pipfile.lock',
    'poetry.lock': 'poetry.lock',
    'composer.json': 'composer.json',
    'composer.lock': 'composer.lock',
    'gemfile.lock': 'Gemfile.lock',
  };
  if (Object.hasOwn(names, name)) return names[name]!;
  if (name.endsWith('.csproj')) return '*.csproj';
  if (name.endsWith('.runtimeconfig.json')) return 'runtimeconfig.json';
  if (/^requirements[\w.-]*\.(?:txt|in)$/.test(name)) return 'requirements.txt';
  if (/^dockerfile\./.test(name)) return 'Dockerfile';
  return null;
}

export function isSupportedFilename(filename: string): boolean {
  return namedType(filename) !== null;
}

/** A filename disambiguates scalar pins; structured pasted manifests are content-detected. */
export function detectFileType(text: string, filename?: string): FileType | null {
  const named = filename ? namedType(filename) : null;
  if (named) return named;
  const t = text.trimStart();
  if (t.startsWith('{')) {
    try {
      const doc = JSON.parse(t);
      if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
        if (doc.sdk) return 'global.json';
        if (doc.runtimeOptions) return 'runtimeconfig.json';
        if (doc.lockfileVersion !== undefined && (doc.packages || doc.dependencies))
          return 'package-lock.json';
        if (doc._meta && (doc.default || doc.develop)) return 'Pipfile.lock';
        if (Array.isArray(doc.packages)) return 'composer.lock';
        if (doc.require || doc['require-dev']) return 'composer.json';
      }
    } catch {
      /* Other readers handle malformed JSON without throwing. */
    }
  }
  if (isCompose(t)) return 'compose.yaml';
  if (isKubernetes(t)) return 'Kubernetes';
  if (t.startsWith('{')) return 'package.json';
  if (/<Project\b/.test(t)) return '*.csproj';
  if (/<project[\s>]/.test(t)) return 'pom.xml';
  if (/^\s*FROM\s/im.test(t)) return 'Dockerfile';
  if (/^\s*(module\s|go\s+\d)/m.test(t)) return 'go.mod';
  if (/^\s*lockfileVersion\s*:/m.test(t)) return 'pnpm-lock.yaml';
  if (
    /^# yarn lockfile v1|^__metadata\s*:/m.test(t) ||
    /^\S.*@.*:\s*\n {2}version(?:\s|:)/m.test(t)
  )
    return 'yarn.lock';
  if (/^\s*\[tools\]\s*(?:#.*)?$/m.test(t)) return 'mise.toml';
  if (/^\s*(nodejs|node|python|golang|ruby|java|dotnet)\s+(?!=)\S+/m.test(t))
    return '.tool-versions';
  if (
    /^\s*\[\s*(?:project|build-system|dependency-groups|tool\.poetry(?:\.[\w.-]+)?)\s*\]/m.test(t)
  )
    return 'pyproject.toml';
  if (/^version\s*=\s*\d/m.test(t) && /^requires-python\s*=/m.test(t)) return 'uv.lock';
  if (/^\s*\[\[package\]\]/m.test(t)) return 'poetry.lock';
  if (/\bJavaLanguageVersion\s*\.|\bsourceCompatibility\b|org\.springframework\.boot/.test(t))
    return 'build.gradle';
  if (/^(?:GEM|RUBY VERSION)\s*$/m.test(t)) return 'Gemfile.lock';
  if (/^\s*django(?:\[[^\]]+\])?\s*(?:[=<>!~;]|$)/im.test(t)) return 'requirements.txt';
  if (parsePythonVersion(t).length) return '.python-version';
  return null;
}

export function parseAny(
  text: string,
  filename?: string,
): { type: FileType | null; components: Component[] } {
  const type = detectFileType(text, filename);
  let components: Component[];
  switch (type) {
    case 'Kubernetes':
      components = parseKubernetes(text);
      break;
    case 'compose.yaml':
      components = parseCompose(text);
      break;
    case 'uv.lock':
      components = [...parseUvLock(text), ...parsePythonDependencies(text, type)];
      break;
    case 'pyproject.toml':
      components = [...parsePyproject(text), ...parsePythonDependencies(text, type)];
      break;
    case 'requirements.txt':
    case 'Pipfile.lock':
    case 'poetry.lock':
      components = parsePythonDependencies(text, type);
      break;
    case 'composer.json':
    case 'composer.lock':
      components = parseComposer(text, type);
      break;
    case 'Gemfile.lock':
      components = parseGemfileLock(text);
      break;
    case 'global.json':
    case 'runtimeconfig.json':
      components = parseDotnetJson(text);
      break;
    case '*.csproj':
    case 'Directory.Build.props':
      components = parseDotnetXml(text, filename ?? type);
      break;
    case 'build.gradle':
    case 'build.gradle.kts':
      components = parseGradle(text, filename ?? type);
      break;
    case '.nvmrc':
    case '.node-version':
    case '.ruby-version':
    case '.tool-versions':
    case 'mise.toml':
      components = parseRuntimeFile(text, type);
      break;
    case 'package-lock.json':
      components = parsePackageLock(text);
      break;
    case 'pnpm-lock.yaml':
      components = parsePnpmLock(text);
      break;
    case 'yarn.lock':
      components = parseYarnLock(text);
      break;
    case 'package.json':
      components = parsePackageJson(text);
      break;
    case 'pom.xml':
      components = parsePomXml(text);
      break;
    case 'go.mod':
      components = parseGoMod(text);
      break;
    case 'Dockerfile':
      components = parseDockerfile(text);
      break;
    case '.python-version':
      components = parsePythonVersion(text);
      break;
    default:
      components = [];
  }
  const source = filename?.split(/[\\/]/).pop();
  return { type, components: source ? components.map((c) => ({ ...c, source })) : components };
}
