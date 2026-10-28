import { describe, expect, it, vi } from 'vitest';
import { isProjectFileCandidate, readProjectFiles } from '../src/lib/project-files.ts';

function file(
  source: string,
  text: string,
  size = new TextEncoder().encode(text).length,
  read = vi.fn(async () => text),
) {
  return {
    name: source.split('/').pop()!,
    webkitRelativePath: source,
    size,
    text: read,
  };
}

describe('project folder scanning', () => {
  it('selects supported filenames and structured manifest candidates', () => {
    expect(isProjectFileCandidate('apps/web/.nvmrc')).toBe(true);
    expect(isProjectFileCandidate('apps/api/package.json')).toBe(true);
    expect(isProjectFileCandidate('apps/api/deployment.yaml')).toBe(true);
    expect(isProjectFileCandidate('README.md')).toBe(false);
  });

  it('skips dependency and output directories before reading files', async () => {
    const dependency = file('app/node_modules/example/package.json', '{"engines":{"node":"22"}}');
    const output = file('app/dist/deployment.yaml', 'services:\n  app:\n    image: node:22');
    const manifest = file('app/deployment.yaml', 'services:\n  app:\n    image: node:22');

    const result = await readProjectFiles([dependency, output, manifest], {
      projectDirectory: true,
    });

    expect(result.files.map(({ source }) => source)).toEqual(['app/deployment.yaml']);
    expect(result.ignored).toBe(2);
    expect(dependency.text).not.toHaveBeenCalled();
    expect(output.text).not.toHaveBeenCalled();
  });

  it('skips nested worktrees before reading and does not match similar directory names', async () => {
    const nestedWorktree = file(
      'apps/web/.worktrees/feature/package.json',
      '{"engines":{"node":"22"}}',
    );
    const windowsWorktree = file('apps\\api\\.WORKTREES\\feature\\.nvmrc', '22');
    const similarDirectory = file(
      'apps/web/.worktrees-backup/package.json',
      '{"engines":{"node":"22"}}',
    );

    const result = await readProjectFiles([nestedWorktree, windowsWorktree, similarDirectory], {
      projectDirectory: true,
      existingFileCount: 199,
    });

    expect(result.files.map(({ source }) => source)).toEqual([
      'apps/web/.worktrees-backup/package.json',
    ]);
    expect(result.ignored).toBe(2);
    expect(result.overLimit).toBe(0);
    expect(nestedWorktree.text).not.toHaveBeenCalled();
    expect(windowsWorktree.text).not.toHaveBeenCalled();
    expect(similarDirectory.text).toHaveBeenCalledOnce();
  });

  it('keeps relative paths and filters unrecognised JSON by its contents', async () => {
    const unknown = file('apps/web/settings.json', '{"name":"settings"}');
    const manifest = file(
      'apps/web/package.json',
      '{"engines":{"node":"22"},"dependencies":{"react":"19.0.0"}}',
    );

    const result = await readProjectFiles([unknown, manifest], { projectDirectory: true });

    expect(result.files.map(({ source }) => source)).toEqual(['apps/web/package.json']);
    expect(result.unsupported).toBe(1);
  });

  it('enforces per-file and file-count limits before reading', async () => {
    const oversized = file('app/large/package.json', '{}', 5 * 1024 * 1024 + 1);
    const first = file('app/one/.nvmrc', '22', 2);
    const overCount = file('app/two/.nvmrc', '22', 2);

    const result = await readProjectFiles([oversized, first, overCount], {
      projectDirectory: true,
      existingFileCount: 199,
    });

    expect(result.files.map(({ source }) => source)).toEqual(['app/one/.nvmrc']);
    expect(result.tooLarge).toBe(1);
    expect(result.overLimit).toBe(1);
    expect(oversized.text).not.toHaveBeenCalled();
    expect(overCount.text).not.toHaveBeenCalled();
  });

  it('enforces the total-byte limit including files already added', async () => {
    const overBudget = file('app/two/.nvmrc', '22', 2);

    const result = await readProjectFiles([overBudget], {
      projectDirectory: true,
      existingBytes: 20 * 1024 * 1024 - 1,
    });

    expect(result.files).toEqual([]);
    expect(result.overLimit).toBe(1);
    expect(overBudget.text).not.toHaveBeenCalled();
  });

  it('continues after a file read error and reports the failure', async () => {
    const failed = file(
      'app/broken/.nvmrc',
      '',
      0,
      vi.fn(async () => Promise.reject(new Error('denied'))),
    );
    const next = file('app/next/.nvmrc', '20');

    const result = await readProjectFiles([failed, next], { projectDirectory: true });

    expect(result.files.map(({ source }) => source)).toEqual(['app/next/.nvmrc']);
    expect(result.failed).toBe(1);
  });

  it('ignores Composer and Python/Gradle/Turbo dependency directories before reading', async () => {
    const dependencies = [
      file('app/vendor/acme/library/composer.json', '{"require":{"php":"^8.2"}}'),
      file('app/.venv/lib/python/site-packages/project/pyproject.toml', '[project]'),
      file('app/venv/lib/python/site-packages/project/requirements.txt', 'django==5.0'),
      file('app/.gradle/caches/project/build.gradle', 'plugins {}'),
      file('app/.turbo/cache/package.json', '{"engines":{"node":"22"}}'),
    ];

    const result = await readProjectFiles(dependencies, { projectDirectory: true });

    expect(result.files).toEqual([]);
    expect(result.ignored).toBe(dependencies.length);
    for (const dependency of dependencies) expect(dependency.text).not.toHaveBeenCalled();
  });

  it('prioritizes recognized filenames over unrelated JSON within the file limit', async () => {
    const settings = Array.from({ length: 200 }, (_, index) =>
      file(`apps/web/settings-${index}.json`, '{"name":"settings"}'),
    );
    const manifest = file(
      'apps/web/package.json',
      '{"engines":{"node":"22"},"dependencies":{"react":"19.0.0"}}',
    );

    const result = await readProjectFiles([...settings, manifest], { projectDirectory: true });

    expect(result.files.map(({ source }) => source)).toContain('apps/web/package.json');
    expect(result.read).toBe(200);
    expect(result.overLimit).toBe(1);
    expect(manifest.text).toHaveBeenCalledOnce();
  });

  it('prioritizes recognized filenames before unrelated JSON consumes the byte budget', async () => {
    const settings = Array.from({ length: 4 }, (_, index) =>
      file(`apps/web/settings-${index}.json`, '{"name":"settings"}', 5 * 1024 * 1024),
    );
    const manifest = file(
      'apps/web/package.json',
      '{"engines":{"node":"22"},"dependencies":{"react":"19.0.0"}}',
    );

    const result = await readProjectFiles([...settings, manifest], { projectDirectory: true });

    expect(result.files.map(({ source }) => source)).toContain('apps/web/package.json');
    expect(result.bytesRead).toBeLessThanOrEqual(20 * 1024 * 1024);
    expect(manifest.text).toHaveBeenCalledOnce();
  });

  it('keeps manual file uploads unfiltered while still applying read limits', async () => {
    const textFile = file('notes.txt', 'plain text');
    const result = await readProjectFiles([textFile]);

    expect(result.files.map(({ source }) => source)).toEqual(['notes.txt']);
    expect(textFile.text).toHaveBeenCalledOnce();
  });
});
