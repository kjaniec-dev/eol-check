const APPLICATION_MANIFEST_NAMES = new Set([
  'package.json',
  'pom.xml',
  'go.mod',
  'pyproject.toml',
  'composer.json',
  'directory.build.props',
  'build.gradle',
  'build.gradle.kts',
]);

function normalizedPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function directoryName(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator < 0 ? '' : path.slice(0, separator);
}

function isApplicationManifest(path: string): boolean {
  const filename = path.split('/').pop()!.toLowerCase();
  return (
    APPLICATION_MANIFEST_NAMES.has(filename) ||
    filename.endsWith('.csproj') ||
    /^requirements[\w.-]*\.(?:txt|in)$/.test(filename)
  );
}

export function applicationForPath(path: string, manifestPaths: string[] = []): string {
  const normalized = normalizedPath(path);
  const parent = directoryName(normalized);
  const manifestDirectories = new Set(
    manifestPaths.map(normalizedPath).filter(isApplicationManifest).map(directoryName),
  );
  let ancestor = parent;

  while (true) {
    if (manifestDirectories.has(ancestor)) return ancestor || 'root';
    const separator = ancestor.lastIndexOf('/');
    if (separator < 0) break;
    ancestor = ancestor.slice(0, separator);
  }

  return parent || 'root';
}
