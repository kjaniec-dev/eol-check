import { describe, expect, it } from 'vitest';
import { fetchProduct, fetchProducts } from '../scripts/eol-api.ts';

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const productResponse = () =>
  response({
    result: {
      label: 'Node.js',
      releases: [{ cycle: '22', eol: false, lts: true, releaseDate: '2024-04-23' }],
    },
  });

const resetError = () =>
  Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
  });

describe('EOL API fetching', () => {
  it('retries a connection reset with exponential backoff and normalizes the response', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const product = await fetchProduct('nodejs', {
      fetchImpl: async () => {
        attempts += 1;
        if (attempts < 4) throw resetError();
        return productResponse();
      },
      sleep: async (delay) => {
        delays.push(delay);
      },
    });

    expect(attempts).toBe(4);
    expect(delays).toEqual([250, 500, 1000]);
    expect(product).toEqual({
      label: 'Node.js',
      releases: [
        { name: '22', isEol: false, eolFrom: null, isLts: true, releaseDate: '2024-04-23' },
      ],
    });
  });

  it('reports the product, URL, final attempt and network error when retries are exhausted', async () => {
    await expect(
      fetchProduct('nodejs', {
        fetchImpl: async () => {
          throw resetError();
        },
        sleep: async () => {},
      }),
    ).rejects.toThrow(
      /nodejs.*https:\/\/endoflife\.date\/api\/v1\/products\/nodejs\/.*attempt 4\/4.*ECONNRESET/i,
    );
  });

  it('does not retry an unknown product response', async () => {
    let attempts = 0;
    const product = await fetchProduct('not-a-product', {
      fetchImpl: async () => {
        attempts += 1;
        return new Response(null, { status: 404 });
      },
      sleep: async () => {},
    });

    expect(product).toBeNull();
    expect(attempts).toBe(1);
  });

  it('retries HTTP 429 and server errors but fails immediately on other HTTP errors', async () => {
    let attempts = 0;
    const product = await fetchProduct('nodejs', {
      fetchImpl: async () => {
        attempts += 1;
        return attempts < 3
          ? new Response(null, { status: attempts === 1 ? 429 : 503 })
          : productResponse();
      },
      sleep: async () => {},
    });
    expect(product?.label).toBe('Node.js');
    expect(attempts).toBe(3);

    attempts = 0;
    await expect(
      fetchProduct('nodejs', {
        fetchImpl: async () => {
          attempts += 1;
          return new Response(null, { status: 400 });
        },
        sleep: async () => {},
      }),
    ).rejects.toThrow(/HTTP 400/);
    expect(attempts).toBe(1);
  });

  it('does not retry malformed JSON', async () => {
    let attempts = 0;
    await expect(
      fetchProduct('nodejs', {
        fetchImpl: async () => {
          attempts += 1;
          return new Response('{invalid json');
        },
        sleep: async () => {},
      }),
    ).rejects.toThrow(/JSON/i);
    expect(attempts).toBe(1);
  });

  it('retries if reading a successful response body fails with a connection reset', async () => {
    let attempts = 0;
    const product = await fetchProduct('nodejs', {
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) {
          const response = new Response('{}');
          Object.defineProperty(response, 'json', {
            value: async () => {
              throw resetError();
            },
          });
          return response;
        }
        return productResponse();
      },
      sleep: async () => {},
    });

    expect(product?.label).toBe('Node.js');
    expect(attempts).toBe(2);
  });

  it('applies a request timeout and retries the resulting timeout error', async () => {
    let attempts = 0;
    await expect(
      fetchProduct('nodejs', {
        timeoutMs: 5,
        maxAttempts: 1,
        fetchImpl: (_input, init) =>
          new Promise((_resolve, reject) => {
            attempts += 1;
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
              once: true,
            });
          }),
        sleep: async () => {},
      }),
    ).rejects.toThrow(/timed out/i);
    expect(attempts).toBe(1);
  });

  it('limits concurrent product requests to four', async () => {
    let active = 0;
    let maximumActive = 0;
    const products = await fetchProducts(
      Array.from({ length: 12 }, (_, index) => `product-${index}`),
      {
        fetchImpl: async () => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await new Promise((resolve) => setTimeout(resolve, 1));
          active -= 1;
          return productResponse();
        },
        sleep: async () => {},
      },
    );

    expect(products).toHaveLength(12);
    expect(maximumActive).toBe(4);
  });
});
