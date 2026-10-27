import { isSupportedFilename, parseAny } from './parsers/index.ts';

export const PROJECT_SCAN_LIMITS = {
  maxFiles: 200,
  maxFileBytes: 5 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
} as const;

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.astro',
  '.next',
  '.nuxt',
  '.output',
  'node_modules',
  'build',
  'coverage',
  'dist',
  'out',
  'target',
]);

export interface ProjectFileLike {
  name: string;
  size: number;
  webkitRelativePath?: string;
  text(): Promise<string>;
}

export interface ScannedProjectFile {
  file: ProjectFileLike;
  source: string;
  text: string;
  size: number;
}

export interface ProjectScanResult {
  files: ScannedProjectFile[];
  ignored: number;
  unsupported: number;
  tooLarge: number;
  overLimit: number;
  failed: number;
  read: number;
  bytesRead: number;
}

interface ReadOptions {
  projectDirectory?: boolean;
  existingFileCount?: number;
  existingBytes?: number;
}

function sourcePath(file: ProjectFileLike): string {
  return file.webkitRelativePath || file.name;
}

function isInIgnoredDirectory(path: string): boolean {
  const segments = path.replace(/\\/g, '/').split('/');
  return segments.slice(0, -1).some((segment) => IGNORED_DIRECTORIES.has(segment.toLowerCase()));
}

export function isProjectFileCandidate(path: string): boolean {
  if (isInIgnoredDirectory(path)) return false;
  if (isSupportedFilename(path)) return true;
  return /\.(?:json|ya?ml)$/i.test(path);
}

export async function readProjectFiles(
  picked: ProjectFileLike[],
  options: ReadOptions = {},
): Promise<ProjectScanResult> {
  const result: ProjectScanResult = {
    files: [],
    ignored: 0,
    unsupported: 0,
    tooLarge: 0,
    overLimit: 0,
    failed: 0,
    read: 0,
    bytesRead: 0,
  };
  const projectDirectory = options.projectDirectory ?? false;
  const existingFileCount = options.existingFileCount ?? 0;
  const existingBytes = options.existingBytes ?? 0;

  for (const file of picked) {
    const source = sourcePath(file);
    if (projectDirectory && isInIgnoredDirectory(source)) {
      result.ignored++;
      continue;
    }
    if (projectDirectory && !isProjectFileCandidate(source)) {
      result.unsupported++;
      continue;
    }
    if (file.size > PROJECT_SCAN_LIMITS.maxFileBytes) {
      result.tooLarge++;
      continue;
    }
    if (
      existingFileCount + result.read >= PROJECT_SCAN_LIMITS.maxFiles ||
      existingBytes + result.bytesRead + file.size > PROJECT_SCAN_LIMITS.maxTotalBytes
    ) {
      result.overLimit++;
      continue;
    }

    result.read++;
    result.bytesRead += file.size;
    let text: string;
    try {
      text = await file.text();
    } catch {
      result.failed++;
      continue;
    }

    if (projectDirectory && !isSupportedFilename(source)) {
      try {
        if (parseAny(text, source).components.length === 0) {
          result.unsupported++;
          continue;
        }
      } catch {
        result.failed++;
        continue;
      }
    }
    result.files.push({ file, source, text, size: file.size });
  }

  return result;
}
