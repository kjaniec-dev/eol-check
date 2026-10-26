import { parse as parseToml } from 'smol-toml';
import type { Component } from '../types.ts';
import { minVersion } from './packagejson.ts';

import { ECOSYSTEM_PRODUCTS } from '../mapping.ts';

export { ECOSYSTEM_PRODUCTS };

function table(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function unique(items: Component[]): Component[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = JSON.stringify([item.product, item.version]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Locked versions remain verbatim, including v prefixes and prerelease syntax. */
function exactVersion(value: unknown): string | null {
  return typeof value === 'string' &&
    /^v?\d+(?:\.\d+)*(?:(?:[-+._][\da-zA-Z][\da-zA-Z.+_-]*)|(?:(?:a|b|rc|post|dev)\d+(?:\.[a-z0-9]+)*))?$/.test(
      value,
    )
    ? value
    : null;
}

function component(
  source: string,
  name: string,
  range: string,
  product: string,
  version: string | null,
  versionBasis: Component['versionBasis'] = version === null ? 'range' : 'declared',
): Component {
  return {
    source,
    kind: product === 'php' || product === 'ruby' ? 'runtime' : 'framework',
    label: `${name}${range ? ` ${range}` : ''}`,
    product,
    version,
    versionBasis,
  };
}

function exactPythonDeclaration(range: string): boolean {
  const exact = /^(?:===|==)\s*(.+)$/.exec(range.trim());
  return exact ? exactVersion(exact[1]!) !== null : exactVersion(range.trim()) !== null;
}

/** PEP 440 numeric lower bounds; unsupported/excluded bounds stay unknown. */
function pythonMinimum(range: string, poetry = false): string | null {
  const value = range.trim();
  const exact = /^(?:===?)?(v?\d+(?:\.\d+)*(?:[a-zA-Z][\da-zA-Z.]*|[.+-][\da-zA-Z.+-]+)?)$/.exec(
    value,
  );
  if (exact) return exactVersion(exact[1]);
  if (!value || value === '*') return null;
  const converted: string[] = [];
  for (const bound of value.split(',')) {
    const match = /^(>=|<=|==|~=|>|<|\^|~)?\s*(\d+(?:\.\d+){0,2})(\.\*)?$/.exec(bound.trim());
    if (!match) return null;
    const [, operator = '', version, wildcard] = match;
    if (operator === '>') return null; // PEP 440 has no uniquely representable next version.
    if (!poetry && (operator === '^' || operator === '~')) return null;
    if (wildcard && operator !== '==' && operator !== '') return null;
    if (operator === '~=') {
      const parts = version!.split('.').map(Number);
      if (parts.length < 2 || wildcard) return null;
      const upper = parts.slice(0, -1);
      upper[upper.length - 1] = upper[upper.length - 1]! + 1;
      converted.push(`>=${version}`, `<${upper.join('.')}`);
    } else {
      converted.push(`${operator === '==' ? '' : operator}${version}${wildcard ?? ''}`);
    }
  }
  return minVersion(converted.join(' '));
}

/** Dependencies only: Python runtime declarations are handled by python.ts. */
export function parsePythonDependencies(text: string, source: string): Component[] {
  const out: Component[] = [];
  const add = (name: string, range: string, locked = false, poetry = false) => {
    if (name.toLowerCase().replace(/[-_.]+/g, '-') !== 'django') return;
    const version = locked ? exactVersion(range.replace(/^==/, '')) : pythonMinimum(range, poetry);
    if (locked && version === null) return;
    const versionBasis = locked
      ? 'lockfile'
      : version === null
        ? 'range'
        : exactPythonDeclaration(range)
          ? 'declared'
          : 'minimum';
    out.push(component(source, name, range, 'django', version, versionBasis));
  };
  const requirement = (value: unknown) => {
    if (typeof value !== 'string') return;
    const line = value
      .replace(/\s+#.*$/, '')
      .split(';', 1)[0]!
      .trim();
    // Match the whole package name, never URLs, options or arbitrary mentions of Django.
    const match = /^([a-zA-Z0-9][a-zA-Z0-9._-]*)(?:\[[a-zA-Z0-9_,. -]+\])?\s*(.*)$/.exec(line);
    if (!match) return;
    let range = match[2]!.trim();
    if (range.startsWith('(') && range.endsWith(')')) range = range.slice(1, -1).trim();
    if (range && !/^(?:===?|!=|~=|>=?|<=?)/.test(range)) return;
    // Direct references and URL/hash/options tails must not masquerade as versions.
    if (/@|:\/\/|\s--|\s-\w/.test(range)) return;
    add(match[1]!, range);
  };
  const poetryDependencies = (value: unknown) => {
    for (const [name, spec] of Object.entries(table(value))) {
      const details = table(spec);
      if (['path', 'git', 'url'].some((key) => Object.hasOwn(details, key))) continue;
      const range = typeof spec === 'string' ? spec : details.version;
      if (typeof range === 'string') add(name, range, false, true);
    }
  };
  const filename = source.split(/[\\/]/).pop()!.toLowerCase();
  try {
    if (filename === 'pipfile.lock') {
      const doc = table(JSON.parse(text));
      for (const group of [doc.default, doc.develop]) {
        for (const [name, spec] of Object.entries(table(group))) {
          const version = table(spec).version;
          if (typeof version === 'string' && version.startsWith('==')) add(name, version, true);
        }
      }
    } else if (['poetry.lock', 'uv.lock', 'pyproject.toml'].includes(filename)) {
      const doc = parseToml(text);
      if (filename === 'pyproject.toml') {
        const project = table(doc.project);
        array(project.dependencies).forEach(requirement);
        Object.values(table(project['optional-dependencies'])).forEach((group) =>
          array(group).forEach(requirement),
        );
        // All groups are visited, so include-group objects need no recursive expansion.
        Object.values(table(doc['dependency-groups'])).forEach((group) =>
          array(group).forEach(requirement),
        );
        const poetry = table(table(doc.tool).poetry);
        poetryDependencies(poetry.dependencies);
        Object.values(table(poetry.group)).forEach((group) =>
          poetryDependencies(table(group).dependencies),
        );
        poetryDependencies(poetry['dev-dependencies']);
      } else {
        for (const entry of array(doc.package)) {
          const pkg = table(entry);
          if (typeof pkg.name === 'string' && typeof pkg.version === 'string')
            add(pkg.name, pkg.version, true);
        }
      }
    } else if (/\.txt$|\.in$/.test(filename)) {
      // pip continuation lines are joined; marker expressions are intentionally not evaluated.
      text
        .replace(/\\\r?\n/g, ' ')
        .split(/\r?\n/)
        .forEach((line) => {
          // Strip only complete pip-supported hash tokens; other options stay rejected.
          requirement(line.replace(/\s+--hash=(?:sha256|sha384|sha512):[a-f0-9]+(?=\s|$)/gi, ''));
        });
    }
  } catch {
    return [];
  }
  return unique(out);
}

// These packages share Symfony's framework release series. Polyfills and contracts do not.
const SYMFONY_PACKAGES = new Set([
  'symfony/symfony',
  'symfony/framework-bundle',
  'symfony/http-kernel',
  'symfony/console',
  'symfony/routing',
]);

function composerProduct(name: string): string | null {
  if (name === 'php') return 'php';
  if (name === 'laravel/framework') return 'laravel';
  if (SYMFONY_PACKAGES.has(name)) return 'symfony';
  return null;
}

export function parseComposer(text: string, source: string): Component[] {
  let doc: Record<string, unknown>;
  try {
    doc = table(JSON.parse(text));
  } catch {
    return [];
  }
  const out: Component[] = [];
  const add = (name: string, value: unknown, locked = false) => {
    const product = composerProduct(name);
    if (!product || typeof value !== 'string') return;
    // Branch aliases are unresolved even when their numeric prefix matches a release cycle.
    const unresolved = /\bdev\b|(?:^|\.)[x*](?:$|[.-])/i.test(value);
    const version = locked
      ? unresolved
        ? null
        : exactVersion(value)
      : minVersion(value.replace(/,/g, ' '));
    const versionBasis =
      locked && name !== 'php'
        ? 'lockfile'
        : version === null
          ? 'range'
          : exactVersion(value)
            ? 'declared'
            : 'minimum';
    // Composer tags commonly start with v; lifecycle cycles use numeric prefixes.
    out.push(
      component(source, name, value, product, version?.replace(/^v/, '') ?? null, versionBasis),
    );
  };
  const filename = source.split(/[\\/]/).pop()!.toLowerCase();
  if (filename === 'composer.lock') {
    for (const group of [doc.packages, doc['packages-dev']]) {
      for (const entry of array(group)) {
        const pkg = table(entry);
        // PHP is a platform constraint, not a package in a Composer lockfile.
        if (typeof pkg.name === 'string' && pkg.name !== 'php') add(pkg.name, pkg.version, true);
      }
    }
    for (const group of [doc.platform, doc['platform-dev']]) {
      const php = table(group).php;
      if (typeof php === 'string') add('php', php);
    }
  } else if (filename === 'composer.json') {
    for (const group of [doc.require, doc['require-dev']]) {
      for (const [name, range] of Object.entries(table(group))) add(name, range);
    }
  }
  return unique(out);
}

export function parseGemfileLock(text: string): Component[] {
  const source = 'Gemfile.lock';
  const out: Component[] = [];
  let section = '';
  let specs = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      section = line.trim();
      specs = false;
      continue;
    }
    if (['GEM', 'GIT', 'PATH'].includes(section)) {
      if (/^ {2}specs:\s*$/.test(line)) {
        specs = true;
        continue;
      }
      if (/^ {2}\S/.test(line)) specs = false;
      const rails = specs ? /^ {4}rails \(([^\s()]+)\)\s*$/.exec(line) : null;
      if (rails && exactVersion(rails[1]))
        out.push(component(source, 'rails', rails[1]!, 'ruby-on-rails', rails[1]!, 'lockfile'));
    } else if (section === 'RUBY VERSION') {
      const ruby = /^\s+ruby (\d+\.\d+\.\d+)(?:p\d+)?(?:\s+\([^\r\n]*\))?\s*$/.exec(line);
      if (ruby) out.push(component(source, 'ruby', ruby[1]!, 'ruby', ruby[1]!, 'lockfile'));
    }
  }
  return unique(out);
}
