import type { Product, Release } from '../src/lib/types.ts';

const API = 'https://endoflife.date/api/v1/products';
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [250, 500, 1_000];
const MAX_CONCURRENT_REQUESTS = 4;

class ProductFetchError extends Error {}

type FetchOptions = {
  fetchImpl?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  timeoutMs?: number;
  maxAttempts?: number;
};

type ApiProduct = {
  label?: unknown;
  releases?: Record<string, unknown>[];
};

function toDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function normalizeRelease(release: Record<string, unknown>): Release {
  // v1 uses isEol/eolFrom; tolerate the older `eol` (date | boolean) field as well.
  const eolFrom = toDate(release.eolFrom ?? release.eol);
  return {
    name: String(release.name ?? release.cycle),
    isEol: typeof release.isEol === 'boolean' ? release.isEol : release.eol === true,
    eolFrom,
    isLts: Boolean(release.isLts ?? release.lts),
  };
}

function errorCode(error: unknown): string | null {
  let current = error;
  while (current && typeof current === 'object') {
    const code = 'code' in current ? current.code : null;
    if (typeof code === 'string') return code;
    current = 'cause' in current ? current.cause : null;
  }
  return null;
}

function errorDetails(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return `request timed out after ${timeoutMs}ms`;
  }
  const details: string[] = [];
  let current = error;
  while (current && typeof current === 'object') {
    const message = current instanceof Error ? current.message : String(current);
    const code = 'code' in current && typeof current.code === 'string' ? current.code : null;
    const detail = code ? `${code}: ${message}` : message;
    if (detail && !details.includes(detail)) details.push(detail);
    current = 'cause' in current ? current.cause : null;
  }
  return details.join(' (caused by: ') + ')'.repeat(Math.max(0, details.length - 1));
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'TimeoutError' || error.name === 'AbortError' || error instanceof TypeError) {
    return true;
  }
  return [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
  ].includes(errorCode(error) ?? '');
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function fetchProduct(
  slug: string,
  options: FetchOptions = {},
): Promise<Product | null> {
  const url = `${API}/${slug}/`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? wait;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? MAX_ATTEMPTS, MAX_ATTEMPTS));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        const retryableStatus = response.status === 429 || response.status >= 500;
        const message = `HTTP ${response.status}`;
        if (!retryableStatus || attempt === maxAttempts) {
          throw new ProductFetchError(
            `${slug} (${url}) failed on attempt ${attempt}/${maxAttempts}: ${message}`,
          );
        }
        await sleep(RETRY_DELAYS_MS[attempt - 1]!);
        continue;
      }

      const body = (await response.json()) as {
        result?: ApiProduct;
      } & ApiProduct;
      const product = body.result ?? body;
      return {
        label: String(product.label ?? slug),
        releases: (product.releases ?? []).map(normalizeRelease),
      };
    } catch (error) {
      if (error instanceof ProductFetchError) throw error;
      if (error instanceof SyntaxError || !isRetryable(error) || attempt === maxAttempts) {
        const details = errorDetails(error, timeoutMs);
        throw new Error(
          `${slug} (${url}) failed on attempt ${attempt}/${maxAttempts}: ${details}`,
          { cause: error },
        );
      }
      await sleep(RETRY_DELAYS_MS[attempt - 1]!);
    }
  }

  throw new Error(`${slug} (${url}) failed after ${maxAttempts} attempts`);
}

export async function fetchProducts(
  slugs: string[],
  options: FetchOptions = {},
): Promise<[string, Product | null][]> {
  const results: [string, Product | null][] = new Array(slugs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < slugs.length) {
      const index = nextIndex;
      nextIndex += 1;
      const slug = slugs[index]!;
      results[index] = [slug, await fetchProduct(slug, options)];
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_REQUESTS, slugs.length) }, () => worker()),
  );
  return results;
}
