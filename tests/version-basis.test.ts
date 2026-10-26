import { describe, expect, it } from 'vitest';
import { findingsToMarkdown } from '../src/lib/markdown.ts';
import { parseImageReference } from '../src/lib/parsers/dockerfile.ts';
import type { Finding, Status } from '../src/lib/types.ts';
import { versionBasisInfo } from '../src/lib/version-basis.ts';

describe('version basis', () => {
  it('identifies image tags, codenames, and digest-only references without promising an installed version', () => {
    const tagged = parseImageReference('redis:8', 'Dockerfile')[0]!;
    const codename = parseImageReference('ubuntu:jammy', 'Dockerfile')[0]!;
    const digest = parseImageReference('redis@sha256:abc', 'Dockerfile')[0]!;

    expect(versionBasisInfo(tagged)).toMatchObject({ label: 'Image reference', explanation: expect.stringContaining('tags can move') });
    expect(codename.version).toBe('22.04');
    expect(versionBasisInfo(codename).label).toBe('Image reference');
    expect(digest.version).toBeNull();
    expect(versionBasisInfo(digest)).toMatchObject({ label: 'Image reference', explanation: expect.stringContaining('No runtime version') });
  });

  it('exports the basis, source, and note with Markdown escaping', () => {
    const finding: Finding = {
      component: {
        source: 'services/api|lock.json', kind: 'framework', label: 'Django <4.2',
        product: 'django', version: '4.2.16', versionBasis: 'lockfile',
      },
      status: 'unknown', productLabel: 'Django', cycle: null, eolFrom: null,
      note: 'No cycle | <known>\ncheck',
    };
    const labels: Record<Status, string> = { eol: 'EOL', soon: 'Soon', ok: 'OK', unknown: 'Unknown' };
    const markdown = findingsToMarkdown([finding], labels);

    expect(markdown).toContain('| Status | Component | Version | Basis | Cycle | Support ends | Source | Note |');
    expect(markdown).toContain('Resolved from lockfile: Read as a resolved package version from a lockfile');
    expect(markdown).toContain('services/api&#124;lock.json');
    expect(markdown).toContain('No cycle &#124; &lt;known&gt; check');
  });
});