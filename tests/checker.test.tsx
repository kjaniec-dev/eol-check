// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectScanResult } from '../src/lib/project-files.ts';
import Checker from '../src/components/Checker.tsx';

const { readProjectFilesMock } = vi.hoisted(() => ({ readProjectFilesMock: vi.fn() }));

vi.mock('../src/lib/project-files.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/project-files.ts')>();
  return { ...original, readProjectFiles: readProjectFilesMock };
});

vi.mock('@kjaniec-dev/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@kjaniec-dev/ui')>();
  const { createElement } = await import('react');
  return {
    ...original,
    Dropzone: () =>
      createElement('button', { type: 'button', 'data-testid': 'dropzone' }, 'Dropzone'),
  };
});

let container: HTMLDivElement;
let root: Root;

function file(name: string, text: string): File {
  return new File([text], name);
}

function scanResult(input: File, source: string, text: string): ProjectScanResult {
  return {
    files: [{ file: input, source, text, size: input.size }],
    ignored: 0,
    unsupported: 0,
    tooLarge: 0,
    overLimit: 0,
    failed: 0,
    read: 1,
    bytesRead: input.size,
  };
}

function chooseFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === text,
  );
}

describe('Checker file scanning controls', () => {
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    readProjectFilesMock.mockReset();
    await act(async () => root.render(createElement(Checker)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('disables file removal and clearing and hides Dropzone while a scan is pending', async () => {
    const first = file('package.json', '{"engines":{"node":"22"}}');
    const second = file('Dockerfile', 'FROM node:20');
    let resolveSecond!: (result: ProjectScanResult) => void;
    readProjectFilesMock
      .mockResolvedValueOnce(scanResult(first, 'apps/api/package.json', await first.text()))
      .mockImplementationOnce(
        () => new Promise<ProjectScanResult>((resolve) => (resolveSecond = resolve)),
      );

    const folderInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Choose project folder"]',
    )!;
    await act(async () => {
      chooseFiles(folderInput, [first]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[aria-label="Added files"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dropzone"]')).not.toBeNull();

    const existingApplication = container.querySelector<HTMLInputElement>(
      'input[aria-label="Application for apps/api/package.json"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(
        existingApplication,
        'manually-set',
      );
      existingApplication.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => chooseFiles(folderInput, [second]));

    expect(buttonWithText('Clear all')?.disabled).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>('button[aria-label^="Remove"]')?.disabled,
    ).toBe(true);
    expect(container.querySelector('[data-testid="dropzone"]')).toBeNull();
    expect(container.textContent).toContain('Scanning files…');

    await act(async () => {
      resolveSecond(scanResult(second, 'apps/api/docker/Dockerfile', await second.text()));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(buttonWithText('Clear all')?.disabled).toBe(false);
    expect(container.querySelector('[data-testid="dropzone"]')).not.toBeNull();
    expect(existingApplication.value).toBe('manually-set');
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Application for apps/api/docker/Dockerfile"]',
      )?.value,
    ).toBe('apps/api');
  });
});
