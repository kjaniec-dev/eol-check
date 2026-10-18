// Build-time snapshot of the endoflife.date data we actually use.
// Output: src/data/eol.json (gitignored). Run via `npm run fetch-data` or as part of `npm run build`.
import { mkdir, writeFile } from 'node:fs/promises';
import { allProductSlugs } from '../src/lib/mapping.ts';
import type { Dataset, Product, Release } from '../src/lib/types.ts';

const API = 'https://endoflife.date/api/v1/products';

function toDate(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

function normalizeRelease(r: any): Release {
  // v1 uses isEol/eolFrom; tolerate the older `eol` (date | boolean) field as well.
  const eolFrom = toDate(r.eolFrom ?? r.eol);
  return {
    name: String(r.name ?? r.cycle),
    isEol: typeof r.isEol === 'boolean' ? r.isEol : r.eol === true,
    eolFrom,
    isLts: Boolean(r.isLts ?? r.lts),
  };
}

async function fetchProduct(slug: string): Promise<Product | null> {
  const res = await fetch(`${API}/${slug}/`, { headers: { accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const body: any = await res.json();
  const p = body.result ?? body;
  return { label: String(p.label ?? slug), releases: (p.releases ?? []).map(normalizeRelease) };
}

const slugs = allProductSlugs();
const results = await Promise.all(slugs.map(async (s) => [s, await fetchProduct(s)] as const));

const missing = results.filter(([, p]) => !p).map(([s]) => s);
if (missing.length) {
  // A wrong slug in mapping.ts silently degrades to "unknown" in the UI, so fail the build instead.
  console.error(`Unknown endoflife.date products (fix src/lib/mapping.ts): ${missing.join(', ')}`);
  process.exit(1);
}

const dataset: Dataset = {
  generatedAt: new Date().toISOString(),
  products: Object.fromEntries(results.map(([s, p]) => [s, p!])),
};
await mkdir('src/data', { recursive: true });
await writeFile('src/data/eol.json', JSON.stringify(dataset));
console.log(`Wrote ${slugs.length} products to src/data/eol.json`);
