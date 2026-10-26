// Build-time snapshot of the endoflife.date data we actually use.
// Output: src/data/eol.json (gitignored). Run via `npm run fetch-data` or as part of `npm run build`.
import { mkdir, writeFile } from 'node:fs/promises';
import { allProductSlugs } from '../src/lib/mapping.ts';
import type { Dataset } from '../src/lib/types.ts';
import { fetchProducts } from './eol-api.ts';

async function main(): Promise<void> {
  const slugs = allProductSlugs();
  const results = await fetchProducts(slugs);
  const missing = results.filter(([, product]) => !product).map(([slug]) => slug);
  if (missing.length) {
    // A wrong slug in mapping.ts silently degrades to "unknown" in the UI, so fail the build instead.
    throw new Error(
      `Unknown endoflife.date products (fix src/lib/mapping.ts): ${missing.join(', ')}`,
    );
  }

  const dataset: Dataset = {
    generatedAt: new Date().toISOString(),
    products: Object.fromEntries(results.map(([slug, product]) => [slug, product!])),
  };
  await mkdir('src/data', { recursive: true });
  await writeFile('src/data/eol.json', JSON.stringify(dataset));
  console.log(`Wrote ${slugs.length} products to src/data/eol.json`);
}

main().catch((error: unknown) => {
  console.error(
    `Failed to fetch endoflife.date snapshot: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
