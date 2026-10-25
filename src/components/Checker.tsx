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

export default function Checker() {
  const [pasted, setPasted] = useState('');
  const [pastedType, setPastedType] = useState('');
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [copied, setCopied] = useState(false);

  const { findings, unrecognised } = useMemo(() => {
    const parsed = [
      ...files.map((f) => parseAny(f.text, f.name)),
      ...(pasted.trim() ? [parseAny(pasted, pastedType || undefined)] : []),
    ];
    return {
      findings: sortFindings(check(parsed.flatMap((p) => p.components), dataset)),
      unrecognised: parsed.filter((p) => !p.type).length,
    };
  }, [pasted, pastedType, files]);

  const count = (s: Status) => findings.filter((f) => f.status === s).length;
  const hasInput = files.length > 0 || pasted.trim() !== '';

  async function onFiles(picked: File[]) {
    const read = await Promise.all(picked.map(async (f) => ({ name: f.name, text: await f.text() })));
    setFiles((prev) => [...prev, ...read]);
  }

  async function copyMarkdown() {
    const lines = ['| Status | Component | Version | Cycle | Support ends | Note |', '|---|---|---|---|---|---|'];
    for (const f of findings) {
      lines.push(`| ${LABEL[f.status]} | ${f.productLabel ?? f.component.label} | ${f.component.version ?? ''} | ${f.cycle ?? ''} | ${f.eolFrom ?? ''} | ${f.note ?? ''} |`);
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
          <div className="flex flex-wrap items-center gap-2 text-sm md:col-start-2">
            {files.map((f, i) => (
              <Badge key={`${f.name}-${i}`} variant="info">{f.name}</Badge>
            ))}
            <Button size="sm" variant="danger" onClick={() => setFiles([])}>Clear</Button>
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
          {findings.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Past end of support" value={count('eol')} />
                <Stat label="Ending within 6 months" value={count('soon')} />
                <Stat label="Supported" value={count('ok')} />
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
                      {findings.map((f, i) => (
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
                <Button variant="secondary" onClick={copyMarkdown}>{copied ? 'Copied' : 'Copy as Markdown'}</Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
