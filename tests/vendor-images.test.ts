import { describe, expect, it } from 'vitest';
import { parseAny } from '../src/lib/parsers/index.ts';

const components = (ref: string) => parseAny(`FROM ${ref}`).components;
const versions = (ref: string) => components(ref).map((c) => [c.product, c.version]);

describe('vendor container images', () => {
  it.each([
    ['bitnami/postgresql:16.4.0-debian-12-r1', 'postgresql', '16.4.0'],
    ['docker.io/bitnami/node:22.1.0', 'nodejs', '22.1.0'],
    ['public.ecr.aws/bitnami/redis:7.2', 'redis', '7.2'],
    ['public.ecr.aws/docker/library/python:3.13', 'python', '3.13'],
    ['public.ecr.aws/lambda/nodejs:22', 'nodejs', '22'],
    ['public.ecr.aws/lambda/python:3.13', 'python', '3.13'],
    ['public.ecr.aws/amazoncorretto/amazoncorretto:21', 'amazon-corretto', '21'],
    ['public.ecr.aws/lambda/dotnet:8', 'dotnet', '8.0'],
    ['public.ecr.aws/lambda/nodejs:latest', 'nodejs', null],
  ])('recognises Bitnami and ECR %s', (image, product, version) => {
    expect(versions(image)).toEqual([[product, version]]);
  });

  it('extracts Node and Debian versions from the supplied digest-pinned Distroless image', () => {
    const ref =
      'gcr.io/distroless/nodejs24-debian13:nonroot@sha256:9eeb7f5887d0e239e78264b06f7f11d2e14be534050481803a9e4728fcdd278e';
    expect(versions(ref)).toEqual([
      ['nodejs', '24'],
      ['debian', '13'],
    ]);
    expect(components(ref).every((c) => c.label === ref && c.source === 'Dockerfile')).toBe(true);
    expect(parseAny(`services:\n  app:\n    image: ${ref}`).components).toEqual([
      { source: 'compose.yaml', kind: 'image', label: ref, product: 'nodejs', version: '24' },
      { source: 'compose.yaml', kind: 'image', label: ref, product: 'debian', version: '13' },
    ]);
  });

  it.each(['latest', 'debug-nonroot', 'nonroot-arm64', '999'])(
    'uses name versions rather than the Distroless tag %s',
    (tag) => {
      expect(versions(`gcr.io/distroless/nodejs22-debian12:${tag}`)).toEqual([
        ['nodejs', '22'],
        ['debian', '12'],
      ]);
    },
  );

  it('checks Debian-only Distroless images, including digest-only references', () => {
    for (const name of ['static', 'base', 'base-nossl', 'cc', 'java-base']) {
      expect(versions(`gcr.io/distroless/${name}-debian13@sha256:abc`)).toEqual([['debian', '13']]);
    }
  });

  it('recognises Python without inventing a minor version from the Debian version', () => {
    expect(versions('gcr.io/distroless/python3-debian13:nonroot')).toEqual([
      ['python', null],
      ['debian', '13'],
    ]);
  });

  it('keeps generic Java separate from vendor-specific Java lifecycle data', () => {
    const result = components('gcr.io/distroless/java21-debian13:nonroot');
    expect(result[0]).toMatchObject({ product: null, productLabel: 'Java', version: '21' });
    expect(result[1]).toMatchObject({ product: 'debian', version: '13' });
  });

  it.each([
    ['node:24.1.0-dev', 'nodejs', '24.1.0'],
    ['python:3.13-dev', 'python', '3.13'],
    ['go:1.24', 'go', '1.24'],
    ['postgres:17', 'postgresql', '17'],
    ['nginx:1.28', 'nginx', '1.28'],
    ['node:latest', 'nodejs', null],
    ['python:latest-dev', 'python', null],
  ])('recognises Chainguard %s', (image, product, version) => {
    expect(versions(`cgr.dev/chainguard/${image}`)).toEqual([[product, version]]);
  });

  it('does not infer vendor runtimes from arbitrary namespaces or similar image names', () => {
    for (const image of [
      'example.com/distroless/nodejs24-debian13:nonroot',
      'example.com/chainguard/node:24',
      'gcr.io/distroless/custom-nodejs24-debian13:nonroot',
      'cgr.dev/chainguard/custom-node:24',
    ]) {
      expect(components(image).every((c) => c.product === null)).toBe(true);
    }
  });
});
