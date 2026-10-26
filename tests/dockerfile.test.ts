import { describe, expect, it } from 'vitest';
import { parseDockerfile } from '../src/lib/parsers/dockerfile.ts';

describe('Dockerfile build arguments', () => {
  it('resolves global defaults in bare and braced image tags while preserving labels', () => {
    expect(
      parseDockerfile('ARG VERSION=3.12\nFROM python:$VERSION\nFROM python:${VERSION}-slim'),
    ).toEqual([
      {
        source: 'Dockerfile',
        kind: 'image',
        label: 'python:$VERSION',
        product: 'python',
        version: '3.12',
      },
      {
        source: 'Dockerfile',
        kind: 'image',
        label: 'python:${VERSION}-slim',
        product: 'python',
        version: '3.12',
      },
    ]);
  });

  it('expands chained defaults and a whole image reference', () => {
    const images = parseDockerfile(
      [
        'ARG MAJOR=3',
        'ARG VERSION=${MAJOR}.12',
        'ARG IMAGE=docker.io/library/python:${VERSION}-slim',
        'FROM ${IMAGE}',
      ].join('\n'),
    );
    expect(images).toEqual([
      {
        source: 'Dockerfile',
        kind: 'image',
        label: '${IMAGE}',
        product: 'python',
        version: '3.12',
      },
    ]);
  });

  it('removes quotes from argument defaults', () => {
    const images = parseDockerfile(
      'ARG VERSION="3.12"\nARG IMAGE=\'python\'\nFROM $IMAGE:$VERSION',
    );
    expect(images[0]).toMatchObject({ product: 'python', version: '3.12' });
  });

  it('joins continued instructions and resolves platform-qualified stages', () => {
    const images = parseDockerfile(
      [
        'ARG VERSION=3.\\',
        '12',
        'FROM --platform=$BUILDPLATFORM \\',
        '  python:${VERSION} AS build',
        'FROM build AS test',
        'FROM scratch',
      ].join('\n'),
    );
    expect(images).toEqual([
      {
        source: 'Dockerfile',
        kind: 'image',
        label: 'python:${VERSION}',
        product: 'python',
        version: '3.12',
      },
    ]);
  });

  it('keeps stage-local ARG and ENV out of subsequent FROM instructions', () => {
    const images = parseDockerfile(
      [
        'ARG VERSION=3.12',
        'FROM python:$VERSION AS first',
        'ARG VERSION=2.7',
        'ARG LOCAL=3.11',
        'ENV VERSION=3.10',
        'FROM python:$VERSION',
        'FROM python:$LOCAL',
      ].join('\n'),
    );
    expect(images.map(({ version }) => version)).toEqual(['3.12', '3.12', null]);
  });

  it('does not invent versions from partially unresolved defaults', () => {
    const images = parseDockerfile(
      [
        'ARG PATCH',
        'ARG VERSION=3.${PATCH}',
        'FROM python:$VERSION',
        'FROM python:3.${PATCH}',
        'FROM ${UNKNOWN_IMAGE}',
      ].join('\n'),
    );
    expect(images.map(({ product, version }) => [product, version])).toEqual([
      ['python', null],
      ['python', null],
      [null, null],
    ]);
  });

  it('resolves defaults for unset arguments and distinguishes empty arguments', () => {
    const images = parseDockerfile(
      [
        'ARG EMPTY=',
        'ARG VERSION=${UNSET:-3.12}',
        'FROM python:$VERSION',
        'FROM python:${EMPTY:-3.11}',
        'FROM python:${UNSET-3.10}',
        'FROM python:${EMPTY-3.9}',
      ].join('\n'),
    );
    expect(images.map(({ version }) => version)).toEqual(['3.12', '3.11', '3.10', null]);
  });

  it('resolves nested fallback expressions', () => {
    expect(parseDockerfile('ARG MAJOR=3\nFROM python:${VERSION:-${MAJOR}.12}')[0]).toMatchObject({
      product: 'python',
      version: '3.12',
    });
  });
});
