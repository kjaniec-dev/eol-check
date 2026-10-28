import type { CrossFileDiscrepancy, Finding, Status } from './types.ts';
import { formatMigrationSuggestions, MIGRATION_DISCLAIMER } from './migrations.ts';
import { formatDaysRemaining } from './planning.ts';
import { versionBasisInfo } from './version-basis.ts';

function markdownCell(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;')
    .replace(/[\r\n]+/g, ' ');
}

export function findingsToMarkdown(
  findings: Finding[],
  labels: Record<Status, string>,
  discrepancies: CrossFileDiscrepancy[] = [],
): string {
  const lines = [
    '| Status | Component | Version | Basis | Cycle | Support ends | Time left | Migration suggestions | Source | Note |',
    '|---|---|---|---|---|---|---|---|---|---|',
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
      formatDaysRemaining(finding.daysRemaining),
      finding.status === 'eol' || finding.status === 'soon'
        ? formatMigrationSuggestions(finding.migrationSuggestions ?? [])
        : null,
      finding.component.source,
      finding.note,
    ];
    lines.push(`| ${values.map(markdownCell).join(' | ')} |`);
  }
  if (findings.some(({ status }) => status === 'eol' || status === 'soon')) {
    lines.push('', MIGRATION_DISCLAIMER);
  }
  if (discrepancies.length > 0) {
    lines.push(
      '',
      '### Cross-file version comparisons',
      '',
      '| Product | Application | Environment | File A | Declaration A | File B | Declaration B | Result |',
      '|---|---|---|---|---|---|---|---|',
    );
    for (const discrepancy of discrepancies) {
      const values = [
        discrepancy.productLabel,
        discrepancy.application,
        discrepancy.environment,
        discrepancy.left.source,
        discrepancy.left.label,
        discrepancy.right.source,
        discrepancy.right.label,
        `${discrepancy.result[0]!.toUpperCase()}${discrepancy.result.slice(1)}: ${discrepancy.explanation}`,
      ];
      lines.push(`| ${values.map(markdownCell).join(' | ')} |`);
    }
    lines.push(
      '',
      'Comparisons are based on declarations and do not confirm the versions used at runtime.',
    );
  }
  return lines.join('\n');
}
