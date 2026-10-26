import { describe, expect, it } from 'vitest';
import { check } from '../src/lib/match.ts';
import { ECOSYSTEM_PRODUCTS, parsePythonDependencies, parseComposer, parseGemfileLock } from '../src/lib/parsers/ecosystems.ts';

const pairs = (items: ReturnType<typeof parseComposer>) => items.map(({ product, version }) => [product, version]);

describe('Python dependency manifests', () => {
  it('reads pip hash-locked requirements after joining continuation lines', () => {
    const text = ['Django==4.2.16 \\', ' --hash=sha256:0123456789abcdef \\', ' --hash=sha512:abcdef0123456789'].join('\n');
    expect(pairs(parsePythonDependencies(text, 'requirements.txt'))).toEqual([['django', '4.2.16']]);
  });
  it.each([
    '-r Django.txt', '--requirement Django.txt', '--index-url https://example.com/Django',
    'Django==4.2.16 --hash=sha256:not-hex', 'Django==4.2.16 --hash=sha256:abcdJ',
    'Django==4.2.16 --hash=sha256:', 'Django==4.2.16 --hash=sha256:abcd --index-url https://example.com',
  ])('does not treat options or invalid hash tokens as dependencies: %s', (text) => {
    expect(parsePythonDependencies(text, 'requirements.txt')).toEqual([]);
  });
  it('reads all PEP 735 groups without treating include-group objects as requirements', () => {
    expect(pairs(parsePythonDependencies(`[dependency-groups]
dev = ["Django==4.2.16", {include-group = "web"}, "requests==2.0"]
web = ["Django==5.1.2", {include-group = "dev"}]
test = ["Django==4.2.16"]`, 'pyproject.toml'))).toEqual([['django', '4.2.16'], ['django', '5.1.2']]);
  });
  it('reads exact requirements, extras, comments and markers without matching other package names', () => {
    const items = parsePythonDependencies(`Django[argon2]==4.2.16 ; python_version >= "3.9" # comment
Django==4.2.16
my-django==1.0
django-debug-toolbar==4.0
djangorestframework==3.15
-r Django.txt
--index-url https://example.com/Django==9
https://example.com/Django==9
Django @ https://example.com/package.whl
-e git+https://example.com/repo#egg=Django`, 'requirements.txt');
    expect(pairs(items)).toEqual([['django', '4.2.16']]);
    expect(items[0]).toMatchObject({ source: 'requirements.txt', kind: 'framework' });
  });
  it.each([
    ['Django', null], ['Django>=4.2,<5', '4.2.0'], ['Django~=4.2.1', '4.2.1'],
    ['Django<5', null], ['Django!=4.2', null], ['Django==4.2.*', '4.2.0'],
    ['Django>=5,<4', null], ['Django~=4.2.0,>=4.3', null],
    ['Django==5.0rc1', '5.0rc1'], ['Django>4.2', null],
  ])('interprets %s conservatively', (line, version) => {
    expect(pairs(parsePythonDependencies(line, 'requirements.txt'))).toEqual([['django', version]]);
  });
  it('reads default/develop Pipfile locks, preserving prereleases', () => {
    expect(pairs(parsePythonDependencies(JSON.stringify({ default: { django: { version: '==5.0rc1' }, bad: 42 }, develop: { Django: { version: '==5.0rc1' }, 'django-other': { version: '==8' } } }), 'Pipfile.lock'))).toEqual([['django', '5.0rc1']]);
    expect(parsePythonDependencies('{"default":{"django":{"version":"==5.0rc1"}}}', 'Pipfile.lock')[0])
      .toMatchObject({ versionBasis: 'lockfile' });
  });
  it.each(['poetry.lock', 'uv.lock'])('reads %s packages and keeps distinct resolved versions', (source) => {
    expect(pairs(parsePythonDependencies(`version = 1
[[package]]
name = "django"
version = "4.2.16"
[[package]]
name = "Django"
version = "5.1.2"
[[package]]
name = "django-other"
version = "9"
[[package]]
name = "django"
version = "5.1.2"`, source))).toEqual([['django', '4.2.16'], ['django', '5.1.2']]);
  });
  it('reads project dependencies, optional groups and Poetry dependency tables', () => {
    expect(pairs(parsePythonDependencies(`[project]
dependencies = ["Django>=4.2,<5", "requests==2.0"]
[project.optional-dependencies]
web = ["django==5.1.2"]
[tool.poetry.dependencies]
python = "^3.11"
Django = {version = "~5.2", optional = true}
[tool.poetry.group.dev.dependencies]
django = "^6.0"
[tool.poetry.dev-dependencies]
Django = "^3.2"`, 'pyproject.toml'))).toEqual([
      ['django', '4.2.0'], ['django', '5.1.2'], ['django', '5.2.0'], ['django', '6.0.0'], ['django', '3.2.0'],
    ]);
  });
  it('distinguishes exact declarations, calculated minima and unresolved ranges', () => {
    expect(parsePythonDependencies('Django==4.2.16', 'requirements.txt')[0]).toMatchObject({ version: '4.2.16', versionBasis: 'declared' });
    expect(parsePythonDependencies('Django>=4.2,<5', 'requirements.txt')[0]).toMatchObject({ version: '4.2.0', versionBasis: 'minimum' });
    expect(parsePythonDependencies('Django<5', 'requirements.txt')[0]).toMatchObject({ version: null, versionBasis: 'range' });
  });
  it('ignores Poetry path, git and URL dependencies', () => {
    expect(parsePythonDependencies('[tool.poetry.dependencies]\ndjango = {path = "../django", version = "5.0"}', 'pyproject.toml')).toEqual([]);
  });
  it('ignores malformed lock package versions and fields', () => {
    expect(parsePythonDependencies('[[package]]\nname = "django"\nversion = "5garbage"', 'uv.lock')).toEqual([]);
    expect(parsePythonDependencies('{"default":{"django":{"version":42}}}', 'Pipfile.lock')).toEqual([]);
  });
  it('joins pip continuations and retains original source paths', () => {
    const items = parsePythonDependencies('Django>=4.2,\\\n  <5', 'services/web/requirements-dev.txt');
    expect(pairs(items)).toEqual([['django', '4.2.0']]);
    expect(items[0]?.source).toBe('services/web/requirements-dev.txt');
  });
  it.each(['Pipfile.lock', 'poetry.lock', 'uv.lock', 'pyproject.toml'])('rejects malformed %s data', (source) => {
    for (const text of ['{bad', 'null', '[]', '42', 'package = [1, 2]', 'default = 42']) {
      expect(parsePythonDependencies(text, source)).toEqual([]);
    }
  });
});

describe('Composer', () => {
  it.each(['7.4.x-dev', '7.4.0-dev', 'v7.4.9999999.9999999-dev', 'dev-main', '7.4.*'])
    ('keeps lock branch %s unknown even with a matching supported lifecycle cycle', (version) => {
      const items = parseComposer(JSON.stringify({ packages: [{ name: 'symfony/console', version }] }), 'composer.lock');
      expect(items).toEqual([expect.objectContaining({ product: 'symfony', version: null, label: `symfony/console ${version}` })]);
      const findings = check(items, {
        generatedAt: '2026-10-25',
        products: { symfony: { label: 'Symfony', releases: [{ name: '7.4', isEol: false, eolFrom: null, isLts: true }] } },
      });
      expect(findings.map(({ status, cycle }) => [status, cycle])).toEqual([['unknown', null]]);
    });
  it.each(['composer.json', 'composer.lock'])('omits independently versioned Symfony packages in %s', (source) => {
    const dependencies = {
      'symfony/polyfill-php83': '1.31.0',
      'symfony/contracts': '3.5.0',
      'symfony/service-contracts': '3.5.1',
      'symfony/event-dispatcher-contracts': '3.5.2',
      'symfony/not-a-core-component': '7.2.0',
    };
    const doc = source === 'composer.json' ? { require: dependencies } : {
      packages: Object.entries(dependencies).map(([name, version]) => ({ name, version })),
    };
    expect(parseComposer(JSON.stringify(doc), source)).toEqual([]);
  });
  it.each(['symfony', 'framework-bundle', 'http-kernel', 'console', 'routing'])('tracks the Symfony %s release series', (name) => {
    expect(pairs(parseComposer(JSON.stringify({ require: { [`symfony/${name}`]: '^7.2' } }), 'composer.json')))
      .toEqual([['symfony', '7.2.0']]);
  });
  it('matches v-prefixed Composer locks to lifecycle cycles while retaining declared labels', () => {
    const items = parseComposer(JSON.stringify({ packages: [
      { name: 'laravel/framework', version: 'v11.2.3' },
      { name: 'symfony/http-kernel', version: 'v7.2.1' },
    ] }), 'composer.lock');
    expect(items.map(({ label }) => label)).toEqual(['laravel/framework v11.2.3', 'symfony/http-kernel v7.2.1']);
    const findings = check(items, {
      generatedAt: '2026-10-25',
      products: {
        laravel: { label: 'Laravel', releases: [{ name: '11', isEol: true, eolFrom: '2026-03-12', isLts: false }] },
        symfony: { label: 'Symfony', releases: [{ name: '7.2', isEol: false, eolFrom: null, isLts: false }] },
      },
    }, new Date('2026-10-25T00:00:00Z'));
    expect(findings.map(({ cycle, status }) => [cycle, status])).toEqual([['11', 'eol'], ['7.2', 'ok']]);
  });

  it('reads runtime and framework ranges from require and require-dev with exact names', () => {
    const items = parseComposer(JSON.stringify({ require: { php: '^8.2', 'laravel/framework': '^11.0', 'symfony/console': '6.4.*', 'symfonyish/console': '9', 'my/laravel/framework': '9', 'ext-json': '*' }, 'require-dev': { 'symfony/console': '6.4.*', 'symfony/http-kernel': '^7.1' } }), 'composer.json');
    expect(pairs(items)).toEqual([['php', '8.2.0'], ['laravel', '11.0.0'], ['symfony', '6.4.0'], ['symfony', '7.1.0']]);
    expect(items[0]).toMatchObject({ source: 'composer.json', kind: 'runtime' });
  });
  it('normalizes lock version prefixes and reads platform ranges, omitting unknown packages', () => {
    const items = parseComposer(JSON.stringify({ packages: [{ name: 'laravel/framework', version: 'v11.2.3' }, { name: 'symfony/console', version: 'v7.1.0-RC1' }, { name: 'other/rails', version: '1' }], 'packages-dev': [{ name: 'symfony/console', version: 'v7.1.0-RC1' }], platform: { php: '>=8.2 <9' }, 'platform-dev': { php: '^8.3' } }), 'composer.lock');
    expect(pairs(items)).toEqual([['laravel', '11.2.3'], ['symfony', '7.1.0-RC1'], ['php', '8.2.0'], ['php', '8.3.0']]);
    expect(items[0]).toMatchObject({ versionBasis: 'lockfile' });
    expect(items[2]).toMatchObject({ versionBasis: 'minimum' });
  });
  it.each(['null', '[]', '42', '{bad', '{"require":[],"packages":[null,2,{"name":"php","version":3}]}'])('handles malformed data %s', (text) => {
    expect(parseComposer(text, 'composer.lock')).toEqual([]);
  });
  it('keeps unresolved constraints unknown', () => {
    expect(pairs(parseComposer('{"require":{"php":"*","laravel/framework":"dev-main"}}', 'composer.json'))).toEqual([['php', null], ['laravel', null]]);
  });
});

describe('Gemfile.lock', () => {
  it('reads rails only from specs and Ruby only from its stanza', () => {
    const items = parseGemfileLock(`GEM
  remote: https://rubygems.org/
  specs:
    rails (7.1.3.4)
    rails (7.1.3.4)
      actionpack (= 7.1.3.4)
    rails-helper (9.0)
    rails (8.0.0.beta1)

DEPENDENCIES
  rails (~> 7.1)
  ruby (9.0)

RUBY VERSION
   ruby 3.3.1p55

BUNDLED WITH
   2.5.6`);
    expect(pairs(items)).toEqual([['ruby-on-rails', '7.1.3.4'], ['ruby-on-rails', '8.0.0.beta1'], ['ruby', '3.3.1']]);
    expect(items.every((item) => item.versionBasis === 'lockfile')).toBe(true);
    expect(items.every((item) => item.source === 'Gemfile.lock')).toBe(true);
  });
  it.each(['rails (7.0)', 'DEPENDENCIES\n  rails (7.0)', 'RUBY VERSION\n  ruby nope', 'GEM\n  specs:\n    rails (~> 7.0)'])('ignores misleading or malformed input', (text) => {
    expect(parseGemfileLock(text)).toEqual([]);
  });
  it('exports every emitted lifecycle slug for snapshot integration', () => {
    expect(ECOSYSTEM_PRODUCTS).toEqual(expect.arrayContaining(['django', 'php', 'laravel', 'symfony', 'ruby-on-rails', 'ruby']));
  });
});
