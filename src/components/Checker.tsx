import { useMemo, useState } from 'react';
import {
  Alert, Badge, Button, Card, Dropzone, Stat, Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow, TableWrap, Textarea,
} from '@kjaniec-dev/ui';
import data from '../data/eol.json';
import { check, sortFindings } from '../lib/match.ts';
import { parseAny } from '../lib/parsers/index.ts';
import type { Dataset, Status } from '../lib/types.ts';

const dataset = data as Dataset;

const LABEL: Record<Status, string> = { eol: 'End of life', soon: 'Ending soon', ok: 'Supported', unknown: 'Unknown' };
const VARIANT = { eol: 'danger', soon: 'warning', ok: 'success', unknown: 'neutral' } as const;
const FILTERS: { status: Status; label: string }[] = [
  { status: 'eol', label: 'Past end of support' },
  { status: 'soon', label: 'Ending within 6 months' },
  { status: 'ok', label: 'Supported' },
  { status: 'unknown', label: 'Unknown' },
];
const EXAMPLE = JSON.stringify({
  engines: { node: '18.20.0' },
  dependencies: { react: '19.0.0', typescript: '^5.0.0' },
}, null, 2);

function markdownCell(value: string | null | undefined) {
  return (value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ');
}

export default function Checker() {
  const [pasted, setPasted] = useState('');
  const [pastedType, setPastedType] = useState('');
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [copied, setCopied] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);

  const { findings, unrecognised, emptySources } = useMemo(() => {
    const parsed = [
      ...files.map((f) => ({ ...parseAny(f.text, f.name), source: f.name })),
      ...(pasted.trim() ? [{ ...parseAny(pasted, pastedType || undefined), source: 'Pasted input' }] : []),
    ];
    return {
      findings: sortFindings(check(parsed.flatMap((p) => p.components), dataset)),
      unrecognised: parsed.filter((p) => !p.type).length,
      emptySources: parsed.filter((p) => p.type && p.components.length === 0).map((p) => p.source),
    };
  }, [pasted, pastedType, files]);

  const count = (s: Status) => findings.filter((f) => f.status === s).length;
  const hasInput = files.length > 0 || pasted.trim() !== '';
  const visibleFindings = statusFilter ? findings.filter((f) => f.status === statusFilter) : findings;

  async function onFiles(picked: File[]) {
    const read = await Promise.all(picked.map(async (f) => ({ name: f.name, text: await f.text() })));
    setFiles((prev) => [...prev, ...read]);
  }

  async function copyMarkdown() {
    const lines = ['| Status | Component | Version | Cycle | Support ends | Source | Note |', '|---|---|---|---|---|---|---|'];
    for (const f of findings) {
      lines.push(`| ${[LABEL[f.status], f.productLabel ?? f.component.label, f.component.version, f.cycle, f.eolFrom, f.component.source, f.note].map(markdownCell).join(' | ')} |`);
    }
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Pasted version file
        <select
          aria-label="Pasted version file"
          className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
          value={pastedType}
          onChange={(e) => setPastedType(e.target.value)}
        >
          <option value="">Auto detect manifest</option>
          <option value=".nvmrc">Node.js (.nvmrc / .node-version)</option>
          <option value=".python-version">Python (.python-version)</option>
          <option value=".ruby-version">Ruby (.ruby-version)</option>
        </select>
      </label>
      <div>
        <Button variant="secondary" onClick={() => {
          setPasted(EXAMPLE);
          setPastedType('');
          setStatusFilter(null);
        }}>Try example</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Textarea
          rows={10}
          spellCheck={false}
          className="font-mono text-sm"
          placeholder="Paste a manifest, lockfile, Dockerfile, Compose or Kubernetes YAML…"
          aria-label="Manifest contents"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <Dropzone className="md:flex md:[&>button]:flex-1" onFiles={onFiles} multiple />
        {files.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-2 text-sm md:col-start-2">
            <ul aria-label="Added files" className="m-0 flex min-w-0 flex-1 list-none flex-wrap gap-2 p-0">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-md border border-border bg-muted/40 py-1 pl-2.5 pr-1">
                  <svg className="size-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5" />
                  </svg>
                  <span className="truncate" title={f.name}>{f.name}</span>
                  <button type="button" aria-label={`Remove ${f.name}, file ${i + 1}`} title={`Remove ${f.name}`}
                    className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onClick={() => setFiles((prev) => prev.filter((_, index) => index !== i))}>
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m6 6 12 12M6 18 18 6" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setFiles([])}
              className="shrink-0 cursor-pointer rounded-sm py-2 text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Clear all
            </button>
          </div>
        )}
      </div>

      {hasInput && (
        <section aria-live="polite" className="flex flex-col gap-4">
          {unrecognised > 0 && (
            <Alert variant="warning" title="Unrecognised input">
              {unrecognised} input(s) could not be recognised. Check the supported formats above. For a plain version number, select its tool or upload the original file.
            </Alert>
          )}
          {emptySources.length > 0 && (
            <Alert variant="warning" title="No checked products found">
              Recognised input, but no products covered by lifecycle checks were found in: {emptySources.join(', ')}.
              {' '}This does not confirm that all dependencies are supported.
            </Alert>
          )}
          {findings.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Filter by status">
                {FILTERS.map(({ status, label }) => (
                  <button key={status} type="button" aria-pressed={statusFilter === status}
                    aria-label={`${label}: ${count(status)}`}
                    className={`rounded-lg text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${statusFilter === status ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => setStatusFilter((current) => current === status ? null : status)}>
                    <Stat label={label} value={count(status)} />
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" aria-pressed={statusFilter === null} onClick={() => setStatusFilter(null)}>All results ({findings.length})</Button>
                <p className="text-sm text-muted-foreground">
                  Showing {visibleFindings.length} of {findings.length} results{statusFilter ? ` · ${LABEL[statusFilter]}` : ''}
                </p>
              </div>
              <Card>
                <TableWrap>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Component</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Cycle</TableHead>
                        <TableHead>Support ends</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleFindings.length === 0 && (
                        <TableRow><TableCell colSpan={6}>No results for this status. Choose All results to reset the filter.</TableCell></TableRow>
                      )}
                      {visibleFindings.map((f, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Badge variant={VARIANT[f.status]} dot>{LABEL[f.status]}</Badge>
                            {f.note && <div className="mt-1 text-xs text-muted-foreground">{f.note}</div>}
                          </TableCell>
                          <TableCell>{f.productLabel ?? f.component.label}</TableCell>
                          <TableCell>{f.component.version ?? '—'}</TableCell>
                          <TableCell>{f.cycle ?? '—'}</TableCell>
                          <TableCell>{f.eolFrom ?? '—'}</TableCell>
                          <TableCell>{f.component.source}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrap>
              </Card>
              <div>
                <Button variant="secondary" onClick={copyMarkdown}>{copied ? 'Copied' : 'Copy all results as Markdown'}</Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
