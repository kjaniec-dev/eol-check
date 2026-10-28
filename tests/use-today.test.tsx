// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToday } from '../src/components/useToday.ts';
import { localIsoDate } from '../src/lib/status.ts';

function Probe() {
  return createElement('output', null, localIsoDate(useToday()));
}

describe('useToday', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 28, 23, 59, 0));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(Probe)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('moves to the next day when local midnight passes', async () => {
    expect(container.textContent).toBe('2026-10-28');
    await act(async () => vi.advanceTimersByTimeAsync(2 * 60_000));
    expect(container.textContent).toBe('2026-10-29');
  });

  it('refreshes when a throttled background tab becomes visible again', async () => {
    vi.setSystemTime(new Date(2026, 9, 30, 8, 0, 0)); // timers did not run while hidden
    expect(container.textContent).toBe('2026-10-28');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(container.textContent).toBe('2026-10-30');
  });

  it('keeps the same value while the day is unchanged', async () => {
    vi.setSystemTime(new Date(2026, 9, 28, 23, 59, 30));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(container.textContent).toBe('2026-10-28');
  });
});
