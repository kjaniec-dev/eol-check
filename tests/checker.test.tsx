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

function filterButton(label: string): HTMLButtonElement | undefined {
  return Array.from(
    container.querySelector('[aria-label="Filter by status"]')?.querySelectorAll('button') ?? [],
  ).find((button) => button.textContent?.includes(label));
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
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Application for apps/api/package.json"]',
      )?.value,
    ).toBe('manually-set');
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Application for apps/api/docker/Dockerfile"]',
      )?.value,
    ).toBe('apps/api');
  });

  it('regroups earlier files when a later scan adds their application manifest', async () => {
    const dockerfile = file('Dockerfile', 'FROM node:18');
    const manifest = file('package.json', '{"engines":{"node":">=20 <23"}}');
    readProjectFilesMock
      .mockResolvedValueOnce(
        scanResult(dockerfile, 'apps/api/docker/Dockerfile', await dockerfile.text()),
      )
      .mockResolvedValueOnce(scanResult(manifest, 'apps/api/package.json', await manifest.text()));

    const folderInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Choose project folder"]',
    )!;
    await act(async () => {
      chooseFiles(folderInput, [dockerfile]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Application for apps/api/docker/Dockerfile"]',
      )?.value,
    ).toBe('apps/api/docker');

    await act(async () => {
      chooseFiles(folderInput, [manifest]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Application for apps/api/docker/Dockerfile"]',
      )?.value,
    ).toBe('apps/api');
    expect(
      container.querySelector('[aria-label="Cross-file version comparisons"]')?.textContent,
    ).toContain('conflict');
  });

  it('clears the scan summary when all files are cleared', async () => {
    const inputFile = file('package.json', '{"engines":{"node":"22"}}');
    readProjectFilesMock.mockResolvedValueOnce(
      scanResult(inputFile, 'apps/api/package.json', await inputFile.text()),
    );

    const folderInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Choose project folder"]',
    )!;
    await act(async () => {
      chooseFiles(folderInput, [inputFile]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('Folder scan: added 1');

    await act(async () => buttonWithText('Clear all')?.click());

    expect(container.querySelector('[aria-label="Added files"]')).toBeNull();
    expect(container.textContent).not.toContain('Folder scan: added');
  });

  it('filters findings by multiple statuses and shows all results when the selection is cleared', async () => {
    const inputs = [
      { file: file('eol.json', '{"engines":{"node":"18"}}'), source: 'apps/eol/package.json' },
      {
        file: file('supported.json', '{"engines":{"node":"22"}}'),
        source: 'apps/supported/package.json',
      },
      {
        file: file('unknown.json', '{"engines":{"node":"20"}}'),
        source: 'apps/unknown/package.json',
      },
    ];
    const scannedFiles = await Promise.all(
      inputs.map(async ({ file: input, source }) => ({
        file: input,
        source,
        text: await input.text(),
        size: input.size,
      })),
    );
    readProjectFilesMock.mockResolvedValueOnce({
      files: scannedFiles,
      ignored: 0,
      unsupported: 0,
      tooLarge: 0,
      overLimit: 0,
      failed: 0,
      read: scannedFiles.length,
      bytesRead: scannedFiles.reduce((total, scanned) => total + scanned.size, 0),
    });

    const folderInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Choose project folder"]',
    )!;
    await act(async () => {
      chooseFiles(
        folderInput,
        inputs.map(({ file: input }) => input),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
    await act(async () => filterButton('Past end of support')?.click());
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('tbody')?.textContent).toContain('End of life');

    await act(async () => filterButton('Supported')?.click());
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);

    await act(async () => filterButton('Past end of support')?.click());
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('tbody')?.textContent).toContain('Supported');

    await act(async () => filterButton('Supported')?.click());
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(buttonWithText('All results (3)')).toBeUndefined();
  });

  it('shows an empty state for a zero-count status and restores all results when deselected', async () => {
    const inputFile = file('package.json', '{"engines":{"node":"22"}}');
    readProjectFilesMock.mockResolvedValueOnce(
      scanResult(inputFile, 'apps/api/package.json', await inputFile.text()),
    );

    const folderInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Choose project folder"]',
    )!;
    await act(async () => {
      chooseFiles(folderInput, [inputFile]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => filterButton('Ending within 6 months')?.click());
    expect(container.querySelector('tbody')?.textContent).toContain(
      'No results for the selected statuses',
    );

    await act(async () => filterButton('Ending within 6 months')?.click());
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('tbody')?.textContent).toContain('Supported');
  });

  it('resets status filters when Try example is selected', async () => {
    const inputFile = file('package.json', '{"engines":{"node":"22"}}');
    readProjectFilesMock.mockResolvedValueOnce(
      scanResult(inputFile, 'apps/api/package.json', await inputFile.text()),
    );

    const folderInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Choose project folder"]',
    )!;
    await act(async () => {
      chooseFiles(folderInput, [inputFile]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => filterButton('Past end of support')?.click());
    expect(container.querySelector('tbody')?.textContent).toContain(
      'No results for the selected statuses',
    );

    await act(async () => buttonWithText('Try example')?.click());
    expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
    expect(container.querySelector('tbody')?.textContent).toContain('End of life');
  });
  it('re-labels the soon filter when the warning threshold changes', async () => {
    await act(async () => buttonWithText('Try example')?.click());
    expect(filterButton('Ending within 6 months')).toBeDefined();

    const threshold = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Warning threshold"]',
    )!;
    await act(async () => {
      threshold.value = '365';
      threshold.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(filterButton('Ending within 12 months')).toBeDefined();
    expect(filterButton('Ending within 6 months')).toBeUndefined();
  });

  it('shows time left and lists what loses support by the planning date', async () => {
    await act(async () => buttonWithText('Try example')?.click());
    expect(container.textContent).toContain('Time left');
    expect(container.querySelector('[aria-label="Support planning"] table')).toBeNull();

    const date = container.querySelector<HTMLInputElement>('input[aria-label="Planning date"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        date,
        '2999-12-31',
      );
      date.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const planning = container.querySelector('[aria-label="Support planning"]')!;
    expect(planning.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
    expect(planning.textContent).toContain('Node.js');

    // A date before Node.js 18 reached end of life must not list it.
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        date,
        '2000-01-01',
      );
      date.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(planning.textContent).toContain('Nothing loses support on or before 2000-01-01.');
    expect(planning.querySelector('table')).toBeNull();

    await act(async () => buttonWithText('Clear date')?.click());
    expect(container.querySelector('[aria-label="Support planning"] table')).toBeNull();
  });
});
