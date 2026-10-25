import { parseAllDocuments } from 'yaml';
import type { Component } from '../types.ts';
import { parseImageReference } from './dockerfile.ts';

type Mapping = Record<string, unknown>;
function mapping(value: unknown): value is Mapping {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function documents(text: string): Mapping[] {
  try {
    return parseAllDocuments(text, { merge: true, stringKeys: true }).flatMap((doc) => {
      if (doc.errors.length) return [];
      const value: unknown = doc.toJS({ maxAliasCount: 100 });
      return mapping(value) && typeof value.apiVersion === 'string' && typeof value.kind === 'string'
        ? [value] : [];
    });
  } catch {
    return [];
  }
}

export function isKubernetes(text: string): boolean {
  return documents(text).length > 0;
}

export function parseKubernetes(text: string, source = 'Kubernetes'): Component[] {
  const out: Component[] = [];
  const seen = new WeakSet<object>();
  const visit = (doc: Mapping, inheritedKind?: string) => {
    if (seen.has(doc)) return;
    seen.add(doc);
    const kind = typeof doc.kind === 'string' ? doc.kind : inheritedKind;
    if (kind && (kind === 'List' || kind.endsWith('List'))) {
      const itemKind = kind === 'List' ? undefined : kind.slice(0, -4);
      if (Array.isArray(doc.items)) doc.items.filter(mapping).forEach((item) => visit(item, itemKind));
      return;
    }
    let spec = mapping(doc.spec) ? doc.spec : {};
    if (kind === 'CronJob') {
      const job = mapping(spec.jobTemplate) ? spec.jobTemplate : {};
      spec = mapping(job.spec) ? job.spec : {};
    }
    if (['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'ReplicationController', 'Job', 'CronJob'].includes(String(kind))) {
      const template = mapping(spec.template) ? spec.template : {};
      spec = mapping(template.spec) ? template.spec : {};
    } else if (kind !== 'Pod') return;
    for (const field of ['initContainers', 'containers', 'ephemeralContainers']) {
      const containers = spec[field];
      if (!Array.isArray(containers)) continue;
      for (const container of containers) {
        if (mapping(container) && typeof container.image === 'string' && container.image.trim()) {
          out.push(...parseImageReference(container.image.trim(), source));
        }
      }
    }
  };
  documents(text).forEach((doc) => visit(doc));
  return out;
}
