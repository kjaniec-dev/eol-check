import { describe, expect, it } from 'vitest';
import { check } from '../src/lib/match.ts';
import { detectFileType, parseAny } from '../src/lib/parsers/index.ts';

const versions = (text: string) => parseAny(text).components.map((c) => [c.product, c.version]);

describe('Python manifests', () => {
  it('reads the Python constraint from uv.lock, not package versions', () => {
    const result = parseAny('version = 1\nrevision = 3\nrequires-python = ">=3.10,<4"\n[[package]]\nname = "example"\nversion = "9.9.9"');
    expect(result.type).toBe('uv.lock');
    expect(result.components).toEqual([
      { source: 'uv.lock', kind: 'runtime', label: 'Python >=3.10,<4', product: 'python', version: '3.10' },
    ]);
  });

  it('handles uv upper-only constraints and malformed lock files', () => {
    expect(versions('version = 1\nrequires-python = "<3.12"')).toEqual([['python', null]]);
    expect(parseAny('version = 1\nrequires-python = "unterminated').components).toEqual([]);
  });

  it('reads the minimum Python version from project metadata', () => {
    const text = '[project]\nname = "example"\nrequires-python = ">=3.9,<4"';
    expect(detectFileType(text)).toBe('pyproject.toml');
    expect(versions(text)).toEqual([['python', '3.9']]);
    expect(parseAny(text).components[0]).toMatchObject({ source: 'pyproject.toml', kind: 'runtime' });
  });

  it('parses TOML comments, literal strings and multiline values', () => {
    expect(versions("[project]\nrequires-python = '''\n>=3.11\n''' # Python runtime")).toEqual([['python', '3.11']]);
    expect(versions('[project]\nrequires-python = "~=3.10.0"')).toEqual([['python', '3.10.0']]);
  });

  it('reads legacy Poetry Python constraints', () => {
    expect(versions('[tool.poetry.dependencies]\npython = "^3.10"')).toEqual([['python', '3.10']]);
  });

  it('does not mistake exclusions or upper bounds for installed versions', () => {
    expect(versions('[project]\nrequires-python = "<3.12"')).toEqual([['python', null]]);
    expect(versions('[project]\nrequires-python = "!=3.9,>=3.10"')).toEqual([['python', '3.10']]);
    expect(versions('[project]\nrequires-python = "*"')).toEqual([['python', null]]);
  });

  it('reads pinned interpreters from .python-version, including multiple versions', () => {
    const text = '# pyenv\n3.9.18\n3.11.9\n';
    expect(detectFileType(text)).toBe('.python-version');
    expect(versions(text)).toEqual([['python', '3.9.18'], ['python', '3.11.9']]);
    expect(versions('3.11')).toEqual([['python', '3.11']]);
    expect(detectFileType('hello')).toBeNull();
  });

  it('keeps constraints unknown when the candidate is excluded or outside other bounds', () => {
    for (const range of ['>=3.9,!=3.9.*', '>=3.9,>3.10', '>=3.12,<3.11', '~=3.9.0,>=3.10', '>=3.9,nonsense']) {
      expect(versions(`[project]\nrequires-python = "${range}"`)).toEqual([['python', null]]);
    }
    expect(versions('[project]\nrequires-python = ">=3.8,>=3.11,<4"')).toEqual([['python', '3.11']]);
  });

  it('uses Python lifecycle data for pasted manifests', () => {
    const findings = check(parseAny('[project]\nrequires-python = ">=3.9"').components, {
      generatedAt: '2026-01-01',
      products: { python: { label: 'Python', releases: [
        { name: '3.9', isEol: true, eolFrom: '2025-10-31', isLts: false },
      ] } },
    });
    expect(findings.map((f) => [f.productLabel, f.cycle, f.status])).toEqual([['Python', '3.9', 'eol']]);
  });

  it('handles invalid or irrelevant TOML without throwing', () => {
    expect(parseAny('[project]\nrequires-python = "unterminated').components).toEqual([]);
    expect(parseAny('[project]\nname = "example"').components).toEqual([]);
  });
});
