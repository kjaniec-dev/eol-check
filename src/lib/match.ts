import type { Component, Dataset, Finding, Release, Status } from './types.ts';
import { suggestMigrations } from './migrations.ts';
import { statusOf } from './status.ts';

export { SOON_DAYS, statusOf } from './status.ts';

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

/** Dataset order is not significant; compare numeric segments (8.10 sorts after 8.8). */
function latestMajorRelease(releases: Release[], major: string): Release | null {
  return releases.reduce<Release | null>((best, release) => {
    if (!/^\d+(?:\.\d+)+$/.test(release.name) || !release.name.startsWith(`${major}.`)) return best;
    if (!best) return release;
    const candidate = release.name.split('.').map(Number);
    const current = best.name.split('.').map(Number);
    for (let i = 0; i < Math.max(candidate.length, current.length); i++) {
      const difference = (candidate[i] ?? 0) - (current[i] ?? 0);
      if (difference !== 0) return difference > 0 ? release : best;
    }
    return best;
  }, null);
}

export function check(components: Component[], data: Dataset, today = new Date()): Finding[] {
  return components.map((component): Finding => {
    const base = {
      component,
      productLabel: component.productLabel ?? null,
      cycle: null,
      eolFrom: null,
      note: null,
    };
    if (!component.product)
      return {
        ...base,
        status: 'unknown',
        note: component.productLabel
          ? 'No lifecycle data on endoflife.date'
          : 'Unrecognised product',
      };
    const product = data.products[component.product];
    if (!product) return { ...base, status: 'unknown', note: 'No data for this product' };
    const productLabel = product.label;
    if (!component.version)
      return { ...base, productLabel, status: 'unknown', note: 'Version not pinned' };
    let release = findRelease(product.releases, component.version);
    let note: string | null = null;
    if (
      !release &&
      component.kind === 'image' &&
      component.floatingMajorTag &&
      /^\d+$/.test(component.version)
    ) {
      release = latestMajorRelease(product.releases, component.version);
      if (release)
        note = `Floating major tag: assumes latest known cycle ${release.name}. The deployed image may be older.`;
    }
    if (!release)
      return {
        ...base,
        productLabel,
        status: 'unknown',
        note: `No release cycle for ${component.version}`,
      };
    const status = statusOf(release, today);
    return {
      ...base,
      productLabel,
      status,
      cycle: release.name,
      eolFrom: release.eolFrom,
      note,
      ...(status === 'eol' || status === 'soon'
        ? { migrationSuggestions: suggestMigrations(product.releases, release.name, today) }
        : {}),
    };
  });
}

const ORDER: Record<Status, number> = { eol: 0, soon: 1, unknown: 2, ok: 3 };

export function sortFindings(f: Finding[]): Finding[] {
  return [...f].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
}
