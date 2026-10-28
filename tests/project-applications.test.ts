import { describe, expect, it } from 'vitest';
import { applicationForPath } from '../src/lib/project-applications.ts';
import { findDiscrepancies } from '../src/lib/discrepancies.ts';
import { parseAny } from '../src/lib/parsers/index.ts';

describe('project application grouping', () => {
  it('groups files under their nearest main manifest', () => {
    const manifests = [
      'apps/api/package.json',
      'apps/web/package.json',
      'apps/api/worker/go.mod',
      'apps/api/package-lock.json',
    ];

    expect(applicationForPath('apps/api/docker/Dockerfile', manifests)).toBe('apps/api');
    expect(applicationForPath('apps/web/Dockerfile', manifests)).toBe('apps/web');
    expect(applicationForPath('apps/api/worker/Dockerfile', manifests)).toBe('apps/api/worker');
    expect(applicationForPath('apps/infra/Dockerfile', manifests)).toBe('apps/infra');
    expect(applicationForPath('apps/api/docker/Dockerfile', ['apps/api/package-lock.json'])).toBe(
      'apps/api/docker',
    );
    expect(applicationForPath('apps/api/docker/Dockerfile', ['apps/api/Dockerfile'])).toBe(
      'apps/api/docker',
    );
  });

  it('groups Windows paths and root manifests consistently', () => {
    expect(applicationForPath('apps\\api\\docker\\Dockerfile', ['apps\\api\\package.json'])).toBe(
      'apps/api',
    );
    expect(applicationForPath('Dockerfile', ['package.json'])).toBe('root');
  });

  it('finds a Node.js conflict between an application manifest and nested Dockerfile', () => {
    const manifestPath = 'apps/api/package.json';
    const dockerfilePath = 'apps/api/docker/Dockerfile';
    const manifests = [manifestPath, dockerfilePath];
    const components = [
      ...parseAny('{"engines":{"node":">=20 <23"}}', manifestPath).components.map((component) => ({
        ...component,
        source: manifestPath,
        inputId: manifestPath,
        application: applicationForPath(manifestPath, manifests),
        environment: 'default',
      })),
      ...parseAny('FROM node:18', dockerfilePath).components.map((component) => ({
        ...component,
        source: dockerfilePath,
        inputId: dockerfilePath,
        application: applicationForPath(dockerfilePath, manifests),
        environment: 'default',
      })),
    ];

    const discrepancies = findDiscrepancies(components);

    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]).toMatchObject({ application: 'apps/api', result: 'conflict' });
  });
});
