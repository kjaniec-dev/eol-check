import { describe, expect, it } from 'vitest';
import { detectFileType, parseAny } from '../src/lib/parsers/index.ts';

describe('filename-aware manifest routing', () => {
  it('distinguishes the same scalar version by uploaded filename', () => {
    expect(parseAny('22', '.nvmrc').components[0]).toMatchObject({ product: 'nodejs', version: '22', source: '.nvmrc' });
    expect(parseAny('3.3.5', '.ruby-version').components[0]).toMatchObject({ product: 'ruby', version: '3.3.5' });
    expect(parseAny('3.13', '.python-version').components[0]).toMatchObject({ product: 'python', version: '3.13' });
    expect(parseAny('22').type).toBeNull();
  });

  it.each([
    ['global.json', '{"sdk":{"version":"8.0.404"}}', 'dotnet', '8.0'],
    ['App.csproj', '<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>', 'dotnet', '8.0'],
    ['Directory.Build.props', '<Project><PropertyGroup><TargetFramework>net9.0</TargetFramework></PropertyGroup></Project>', 'dotnet', '9.0'],
    ['build.gradle.kts', 'plugins { id("org.springframework.boot") version "3.4.1" }', 'spring-boot', '3.4.1'],
    ['requirements-dev.txt', 'Django==5.2.1', 'django', '5.2.1'],
    ['composer.json', '{"require":{"php":"^8.3"}}', 'php', '8.3.0'],
    ['Gemfile.lock', 'GEM\n  specs:\n    rails (7.2.2)\n', 'ruby-on-rails', '7.2.2'],
    ['package-lock.json', '{"lockfileVersion":3,"packages":{"node_modules/react":{"version":"18.3.1"}}}', 'react', '18.3.1'],
    ['pnpm-lock.yaml', "lockfileVersion: '9.0'\npackages:\n  react@18.3.1: {}", 'react', '18.3.1'],
    ['yarn.lock', '# yarn lockfile v1\nreact@^18:\n  version "18.3.1"', 'react', '18.3.1'],
    ['mise.toml', '[tools]\nnode = "22.1.0"', 'nodejs', '22.1.0'],
    ['.tool-versions', 'nodejs 22.1.0\n', 'nodejs', '22.1.0'],
  ])('routes %s by name and by structured content', (filename, text, product, version) => {
    const uploaded = parseAny(text, `folder/${filename}`);
    expect(uploaded.components[0]).toMatchObject({ source: filename, product, version });
    expect(parseAny(text).components[0]).toMatchObject({ product, version });
  });

  it('combines uv Python constraints with locked Django versions', () => {
    const text = 'version = 1\nrequires-python = ">=3.12"\n[[package]]\nname = "django"\nversion = "5.2.1"';
    expect(parseAny(text, 'uv.lock').components.map((c) => [c.product, c.version])).toEqual([
      ['python', '3.12'], ['django', '5.2.1'],
    ]);
  });

  it('recognises a pyproject containing only dependency groups', () => {
    const text = '[dependency-groups]\ndev = ["Django==4.2.16"]';
    expect(parseAny(text).type).toBe('pyproject.toml');
  });

  it('preserves Kubernetes and Compose uploaded names', () => {
    expect(parseAny('services:\n  app: {image: "node:22"}', 'docker-compose.yml').components[0]?.source).toBe('docker-compose.yml');
    expect(parseAny('apiVersion: v1\nkind: Pod\nspec:\n  containers: [{image: "node:22"}]', 'deployment.yaml').components[0]?.source).toBe('deployment.yaml');
  });

  it('handles valid JSON scalars and null without throwing', () => {
    for (const text of ['null', '[]', '{}', '"hello"']) expect(() => parseAny(text, 'package.json')).not.toThrow();
  });

  it('does not misclassify a Python project with dependency named version as uv.lock', () => {
    expect(detectFileType('[project]\nrequires-python = ">=3.12"\nversion = "1.0"')).toBe('pyproject.toml');
  });
});
