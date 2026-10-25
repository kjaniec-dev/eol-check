import { describe, expect, it } from 'vitest';
import { parseAny } from '../src/lib/parsers/index.ts';

describe('Compose images', () => {
  it('checks service images and ignores build-only services and unrelated image keys', () => {
    const result = parseAny(`name: example
services:
  db:
    image: postgres:15-alpine
  app:
    image: "registry.example:5000/library/node:18-alpine@sha256:abc"
  local:
    build: .
  worker:
    environment:
      image: redis:6
`);
    expect(result.type).toBe('compose.yaml');
    expect(result.components).toEqual([
      { source: 'compose.yaml', kind: 'image', label: 'postgres:15-alpine', product: 'postgresql', version: '15', floatingMajorTag: true },
      { source: 'compose.yaml', kind: 'image', label: 'registry.example:5000/library/node:18-alpine@sha256:abc', product: 'nodejs', version: '18' },
    ]);
  });

  it('reads YAML aliases, merge keys and inline services', () => {
    const result = parseAny(`x-base: &base
  image: redis:7
services:
  cache:
    <<: *base
  web: {image: 'nginx:1.24'}
`);
    expect(result.components.map((c) => [c.product, c.version])).toEqual([
      ['redis', '7'], ['nginx', '1.24'],
    ]);
  });

  it('keeps unpinned and interpolated tags unknown', () => {
    expect(parseAny(`services:
  a: {image: 'postgres:15.\${PATCH}'}
  b: {image: 'redis:latest'}
  c: {image: 'node@sha256:abc'}
`).components.map((c) => c.version)).toEqual([null, null, null]);
  });

  it('supports JSON syntax and skips invalid service entries', () => {
    expect(parseAny('{"services":{"db":{"image":"postgres:15"},"bad":null,"other":{"image":42}}}').components)
      .toHaveLength(1);
    expect(parseAny('services: [broken').components).toEqual([]);
    expect(parseAny('services: hello').type).toBeNull();
  });
});
