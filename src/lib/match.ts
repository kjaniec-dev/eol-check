import type { Component, Dataset, Finding, Release, Status } from './types.ts';

export const SOON_DAYS = 180;

/** Longest release cycle that is a prefix of the version on a segment boundary ("3.11" matches "3.11.4"). */
export function findRelease(releases: Release[], version: string): Release | null {
  let best: Release | null = null;
  for (const r of releases) {
    if (version === r.name || version.startsWith(r.name + '.')) {
      if (!best || r.name.length > best.name.length) best = r;
    }
  }
  return best;
}

export function statusOf(r: Release, today: Date): Status {
  if (r.isEol) return 'eol';
  if (!r.eolFrom) return 'ok';
  const eol = new Date(r.eolFrom + 'T00:00:00Z').getTime();
  const now = today.getTime();
  if (eol <= now) return 'eol';
  return eol - now <= SOON_DAYS * 86_400_000 ? 'soon' : 'ok';
}

export function check(components: Component[], data: Dataset, today = new Date()): Finding[] {
  return components.map((component): Finding => {
    const base = { component, productLabel: null, cycle: null, eolFrom: null, note: null };
    if (!component.product) return { ...base, status: 'unknown', note: 'Unrecognised product' };
    const product = data.products[component.product];
    if (!product) return { ...base, status: 'unknown', note: 'No data for this product' };
    const productLabel = product.label;
    if (!component.version) return { ...base, productLabel, status: 'unknown', note: 'Version not pinned' };
    const release = findRelease(product.releases, component.version);
    if (!release) return { ...base, productLabel, status: 'unknown', note: `No release cycle for ${component.version}` };
    return { ...base, productLabel, status: statusOf(release, today), cycle: release.name, eolFrom: release.eolFrom };
  });
}

const ORDER: Record<Status, number> = { eol: 0, soon: 1, unknown: 2, ok: 3 };

export function sortFindings(f: Finding[]): Finding[] {
  return [...f].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
}
