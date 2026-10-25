import { describe, expect, it } from 'vitest';
import { parseAny } from '../src/lib/parsers/index.ts';

describe('Kubernetes manifests', () => {
  it('allows literal template text outside image references', () => {
    expect(parseAny(`apiVersion: v1
kind: Pod
metadata:
  annotations: {template: "{{ literal }}"}
spec:
  containers: [{image: 'node:22'}]
`).components.map((c) => [c.product, c.version])).toEqual([['nodejs', '22']]);
  });

  it('inherits the resource kind for typed list items', () => {
    expect(parseAny(`apiVersion: v1
kind: PodList
items:
  - spec:
      containers: [{image: 'node:22'}]
`).components.map((c) => [c.product, c.version])).toEqual([['nodejs', '22']]);
  });

  it('keeps unresolved Helm image expressions unknown without dropping other workloads', () => {
    expect(parseAny(`apiVersion: v1
kind: Pod
spec:
  containers: [{image: 'node:22{{ .Values.suffix }}'}]
---
apiVersion: v1
kind: Pod
spec:
  containers: [{image: 'redis:7'}]
`).components.map((c) => [c.product, c.version])).toEqual([['nodejs', null], ['redis', '7']]);
  });

  it('reads workload containers and init containers across YAML documents', () => {
    const result = parseAny(`apiVersion: apps/v1
kind: Deployment
metadata: {name: web}
spec:
  template:
    spec:
      initContainers:
        - {name: init, image: 'redis:7'}
      containers:
        - {name: web, image: 'node:22'}
---
apiVersion: batch/v1
kind: CronJob
spec:
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - {name: backup, image: 'postgres:16'}
`);
    expect(result.type).toBe('Kubernetes');
    expect(result.components.map((c) => [c.product, c.version])).toEqual([
      ['redis', '7'], ['nodejs', '22'], ['postgresql', '16'],
    ]);
  });

  it('reads JSON List and Pod objects but ignores unrelated image fields', () => {
    const result = parseAny(JSON.stringify({ apiVersion: 'v1', kind: 'List', items: [
      { apiVersion: 'v1', kind: 'Pod', spec: { containers: [{ image: 'python:3.13' }] } },
      { apiVersion: 'v1', kind: 'ConfigMap', data: { image: 'redis:6' } },
    ] }));
    expect(result.components.map((c) => [c.product, c.version])).toEqual([['python', '3.13']]);
  });

  it('uses Distroless runtime and OS extraction for workload images', () => {
    expect(parseAny('apiVersion: v1\nkind: Pod\nspec:\n  containers:\n    - image: gcr.io/distroless/nodejs24-debian13:nonroot').components
      .map((c) => [c.product, c.version])).toEqual([['nodejs', '24'], ['debian', '13']]);
  });

  it('does not throw on malformed YAML or Helm templates', () => {
    expect(parseAny('apiVersion: v1\nkind: Pod\nspec: [broken').components).toEqual([]);
    expect(parseAny('apiVersion: v1\nkind: Pod\nspec:\n  containers: {{ .Values.containers }}').components).toEqual([]);
  });
});
