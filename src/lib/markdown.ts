import type { Finding, Status } from './types.ts';
import { versionBasisInfo } from './version-basis.ts';

function markdownCell(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;')
    .replace(/[\r\n]+/g, ' ');
}

export function findingsToMarkdown(findings: Finding[], labels: Record<Status, string>): string {
  const lines = [
    '| Status | Component | Version | Basis | Cycle | Support ends | Source | Note |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const finding of findings) {
    const basis = versionBasisInfo(finding.component);
    const values = [
      labels[finding.status],
      finding.productLabel ?? finding.component.label,
      finding.component.version,
      `${basis.label}: ${basis.explanation}`,
      finding.cycle,
      finding.eolFrom,
      finding.component.source,
      finding.note,
    ];
    lines.push(`| ${values.map(markdownCell).join(' | ')} |`);
  }
  return lines.join('\n');
}
