import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dropzone,
  Input,
  Select,
  ToggleGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
  Textarea,
} from '@kjaniec-dev/ui';
import data from '../data/eol.json';
import { findDiscrepancies } from '../lib/discrepancies.ts';
import { check, sortFindings } from '../lib/match.ts';
import { formatMigrationSuggestions, MIGRATION_DISCLAIMER } from '../lib/migrations.ts';
import { formatDaysRemaining } from '../lib/planning.ts';
import { findingsToMarkdown } from '../lib/markdown.ts';
import { parseAny } from '../lib/parsers/index.ts';
import { applicationForPath } from '../lib/project-applications.ts';
import { PROJECT_SCAN_LIMITS, readProjectFiles } from '../lib/project-files.ts';
import type { ProjectScanResult } from '../lib/project-files.ts';
import { SOON_DAYS, SOON_DAYS_OPTIONS } from '../lib/status.ts';
import type { Dataset, Status } from '../lib/types.ts';
import { versionBasisInfo } from '../lib/version-basis.ts';
import SupportPlanning from './SupportPlanning.tsx';
import { useToday } from './useToday.ts';

const dataset = data as Dataset;

interface SelectedFile {
  id: number;
  name: string;
  source: string;
  text: string;
  size: number;
  application: string;
  applicationManuallySet: boolean;
  environment: string;
}

const LABEL: Record<Status, string> = {
  eol: 'End of life',
  soon: 'Ending soon',
  ok: 'Supported',
  unknown: 'Unknown',
};
const VARIANT = { eol: 'danger', soon: 'warning', ok: 'success', unknown: 'neutral' } as const;
const SOON_WINDOW: Record<(typeof SOON_DAYS_OPTIONS)[number], string> = {
  30: '30 days',
  90: '3 months',
  180: '6 months',
  365: '12 months',
};
const EXAMPLE = JSON.stringify(
  {
    engines: { node: '18.20.0' },
    dependencies: { react: '19.0.0', typescript: '^5.0.0' },
  },
  null,
  2,
);

export default function Checker() {
  const [pasted, setPasted] = useState('');
  const [pastedType, setPastedType] = useState('');
  const [pastedApplication, setPastedApplication] = useState('root');
  const [pastedEnvironment, setPastedEnvironment] = useState('default');
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [readingFiles, setReadingFiles] = useState(false);
  const [scanSummary, setScanSummary] = useState<{
    projectDirectory: boolean;
    result: ProjectScanResult;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusFilters, setStatusFilters] = useState<Status[]>([]);
  const [soonDays, setSoonDays] = useState<(typeof SOON_DAYS_OPTIONS)[number]>(SOON_DAYS);
  const [planningDate, setPlanningDate] = useState('');
  const nextFileId = useRef(0);
  const readingFilesRef = useRef(false);

  const today = useToday();
  const { findings, discrepancies, unrecognised, emptySources } = useMemo(() => {
    const parsed = [
      ...files.map((f) => {
        const result = parseAny(f.text, f.source);
        return {
          ...result,
          source: f.source,
          components: result.components.map((component) => ({
            ...component,
            source: f.source,
            inputId: `file-${f.id}`,
            application: f.application.trim() || 'root',
            environment: f.environment.trim() || 'default',
          })),
        };
      }),
      ...(pasted.trim()
        ? [
            (() => {
              const result = parseAny(pasted, pastedType || undefined);
              return {
                ...result,
                source: 'Pasted input',
                components: result.components.map((component) => ({
                  ...component,
                  source: 'Pasted input',
                  inputId: 'pasted-input',
                  application: pastedApplication.trim() || 'root',
                  environment: pastedEnvironment.trim() || 'default',
                })),
              };
            })(),
          ]
        : []),
    ];
    const components = parsed.flatMap((p) => p.components);
    return {
      findings: sortFindings(check(components, dataset, today, soonDays)),
      discrepancies: findDiscrepancies(components),
      unrecognised: parsed.filter((p) => !p.type).length,
      emptySources: parsed.filter((p) => p.type && p.components.length === 0).map((p) => p.source),
    };
  }, [pasted, pastedType, pastedApplication, pastedEnvironment, files, soonDays, today]);

  const count = (s: Status) => findings.filter((f) => f.status === s).length;
  const filters: { status: Status; label: string }[] = [
    { status: 'eol', label: 'Past end of support' },
    { status: 'soon', label: `Ending within ${SOON_WINDOW[soonDays]}` },
    { status: 'ok', label: 'Supported' },
    { status: 'unknown', label: 'Unknown' },
  ];
  const hasInput = files.length > 0 || pasted.trim() !== '';
  const visibleFindings = statusFilters.length
    ? findings.filter((finding) => statusFilters.includes(finding.status))
    : findings;

  async function readPickedFiles(picked: File[], projectDirectory = false) {
    if (readingFilesRef.current) return;
    readingFilesRef.current = true;
    setReadingFiles(true);
    try {
      const result = await readProjectFiles(picked, {
        projectDirectory,
        existingFileCount: files.length,
        existingBytes: files.reduce((total, file) => total + file.size, 0),
      });
      setFiles((previous) => {
        const added = result.files.map(({ file, source, text, size }) => ({
          id: nextFileId.current++,
          name: file.name,
          source,
          text,
          size,
          application: '',
          applicationManuallySet: false,
          environment: 'default',
        }));
        const manifestPaths = [
          ...previous.map(({ source }) => source),
          ...added.map(({ source }) => source),
        ];

        return [
          ...previous.map((file) =>
            file.applicationManuallySet
              ? file
              : { ...file, application: applicationForPath(file.source, manifestPaths) },
          ),
          ...added.map((file) => ({
            ...file,
            application: applicationForPath(file.source, manifestPaths),
          })),
        ];
      });
      setScanSummary({ projectDirectory, result });
    } finally {
      readingFilesRef.current = false;
      setReadingFiles(false);
    }
  }

  async function onFiles(picked: File[]) {
    await readPickedFiles(picked);
  }

  async function copyMarkdown() {
    await navigator.clipboard.writeText(findingsToMarkdown(findings, LABEL, discrepancies));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Pasted version file
        <Select
          aria-label="Pasted version file"
          className="w-fit"
          value={pastedType}
          onChange={(e) => setPastedType(e.target.value)}
        >
          <option value="">Auto detect manifest</option>
          <option value=".nvmrc">Node.js (.nvmrc / .node-version)</option>
          <option value=".python-version">Python (.python-version)</option>
          <option value=".ruby-version">Ruby (.ruby-version)</option>
        </Select>
      </label>
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          Application
          <Input
            aria-label="Application for pasted input"
            className="w-40"
            value={pastedApplication}
            onChange={(event) => setPastedApplication(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2">
          Environment
          <Input
            aria-label="Environment for pasted input"
            className="w-40"
            value={pastedEnvironment}
            onChange={(event) => setPastedEnvironment(event.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          onClick={() => {
            setPasted(EXAMPLE);
            setPastedType('');
            setStatusFilters([]);
          }}
        >
          Try example
        </Button>
        <label className="flex items-center gap-2 text-sm">
          Warn before end of support
          <Select
            aria-label="Warning threshold"
            className="w-fit"
            value={soonDays}
            onChange={(event) =>
              setSoonDays(Number(event.target.value) as (typeof SOON_DAYS_OPTIONS)[number])
            }
          >
            {SOON_DAYS_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </Select>
        </label>
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
        <div className="flex flex-col gap-3">
          <label className="inline-flex w-fit cursor-pointer items-center rounded-kj-md border border-transparent bg-secondary px-3 py-2 text-sm font-semibold leading-none text-secondary-foreground transition-colors hover:bg-secondary-hover focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
            <span>{readingFiles ? 'Scanning…' : 'Choose project folder'}</span>
            <input
              ref={(element) => element?.setAttribute('webkitdirectory', '')}
              type="file"
              multiple
              disabled={readingFiles}
              aria-label="Choose project folder"
              className="sr-only"
              onChange={(event) => {
                const picked = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                void readPickedFiles(picked, true);
              }}
            />
          </label>
          <p className="m-0 text-xs text-muted-foreground">
            Scans supported files locally; up to {PROJECT_SCAN_LIMITS.maxFiles} files,{' '}
            {PROJECT_SCAN_LIMITS.maxFileBytes / 1024 / 1024} MiB each and{' '}
            {PROJECT_SCAN_LIMITS.maxTotalBytes / 1024 / 1024} MiB total.
          </p>
          {readingFiles ? (
            <p role="status" className="m-0 text-xs text-muted-foreground">
              Scanning files… uploads are temporarily unavailable.
            </p>
          ) : (
            <Dropzone
              className="md:flex md:flex-1 md:[&>button]:flex-1"
              onFiles={onFiles}
              multiple
            />
          )}
          {scanSummary && (
            <p role="status" className="m-0 text-xs text-muted-foreground">
              {scanSummary.projectDirectory ? 'Folder scan' : 'File upload'}: added{' '}
              {scanSummary.result.files.length}; ignored {scanSummary.result.ignored}; unsupported{' '}
              {scanSummary.result.unsupported}; over 5 MiB {scanSummary.result.tooLarge}; over
              limits {scanSummary.result.overLimit}; read errors {scanSummary.result.failed}.
              {scanSummary.projectDirectory &&
                ' The browser lists folder entries before filtering; file contents stay in your browser.'}
            </p>
          )}
        </div>
        {files.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-2 text-sm md:col-start-2">
            <ul
              aria-label="Added files"
              className="m-0 flex min-w-0 flex-1 list-none flex-wrap gap-2 p-0"
            >
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex min-w-0 max-w-full flex-col gap-2 rounded-md border border-border bg-muted/40 p-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <svg
                      className="size-4 shrink-0 text-muted-foreground"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5" />
                    </svg>
                    <span className="min-w-0 flex-1 truncate" title={f.source}>
                      {f.source}
                    </span>
                    <button
                      type="button"
                      disabled={readingFiles}
                      aria-label={`Remove ${f.name}, file ${i + 1}`}
                      title={`Remove ${f.name}`}
                      className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onClick={() => setFiles((prev) => prev.filter((file) => file.id !== f.id))}
                    >
                      <svg
                        className="size-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m6 6 12 12M6 18 18 6" />
                      </svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex min-w-0 flex-col gap-1">
                      Application
                      <Input
                        aria-label={`Application for ${f.source}`}
                        className="min-w-0"
                        value={f.application}
                        onChange={(event) =>
                          setFiles((prev) =>
                            prev.map((file) =>
                              file.id === f.id
                                ? {
                                    ...file,
                                    application: event.target.value,
                                    applicationManuallySet: true,
                                  }
                                : file,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1">
                      Environment
                      <Input
                        aria-label={`Environment for ${f.source}`}
                        className="min-w-0"
                        value={f.environment}
                        onChange={(event) =>
                          setFiles((prev) =>
                            prev.map((file) =>
                              file.id === f.id
                                ? { ...file, environment: event.target.value }
                                : file,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={readingFiles}
              onClick={() => {
                setFiles([]);
                setScanSummary(null);
              }}
              className="shrink-0 cursor-pointer rounded-sm py-2 text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {hasInput && (
        <section aria-live="polite" className="flex flex-col gap-4">
          {unrecognised > 0 && (
            <Alert variant="warning" title="Unrecognised input">
              {unrecognised} input(s) could not be recognised. Check the supported formats above.
              For a plain version number, select its tool or upload the original file.
            </Alert>
          )}
          {emptySources.length > 0 && (
            <Alert variant="warning" title="No checked products found">
              Recognised input, but no products covered by lifecycle checks were found in:{' '}
              {emptySources.join(', ')}. This does not confirm that all dependencies are supported.
            </Alert>
          )}
          {findings.length > 0 && (
            <>
              <div className="flex flex-col gap-3">
                <ToggleGroup
                  aria-label="Filter by status"
                  className="flex w-fit max-w-full flex-wrap gap-2 [&>button]:flex-none"
                  options={filters.map(({ status, label }) => ({
                    value: status,
                    label: `${label} (${count(status)})`,
                  }))}
                  value={statusFilters}
                  onChange={setStatusFilters}
                />
                <p className="text-sm text-muted-foreground">
                  Showing {visibleFindings.length} of {findings.length} results
                  {statusFilters.length
                    ? ` · ${statusFilters.map((status) => LABEL[status]).join(', ')}`
                    : ''}
                </p>
              </div>
              <SupportPlanning
                findings={findings}
                today={today}
                date={planningDate}
                onDateChange={setPlanningDate}
                labels={LABEL}
                variants={VARIANT}
              />
              {discrepancies.length > 0 && (
                <section
                  aria-label="Cross-file version comparisons"
                  className="flex flex-col gap-3"
                >
                  <h2 className="text-lg font-semibold">Cross-file version comparisons</h2>
                  <Card>
                    <TableWrap>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Application</TableHead>
                            <TableHead>Environment</TableHead>
                            <TableHead>File A</TableHead>
                            <TableHead>Declaration A</TableHead>
                            <TableHead>File B</TableHead>
                            <TableHead>Declaration B</TableHead>
                            <TableHead>Result</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {discrepancies.map((discrepancy, index) => (
                            <TableRow
                              key={`${discrepancy.left.inputId}-${discrepancy.right.inputId}-${index}`}
                            >
                              <TableCell>{discrepancy.productLabel}</TableCell>
                              <TableCell>{discrepancy.application}</TableCell>
                              <TableCell>{discrepancy.environment}</TableCell>
                              <TableCell>{discrepancy.left.source}</TableCell>
                              <TableCell>{discrepancy.left.label}</TableCell>
                              <TableCell>{discrepancy.right.source}</TableCell>
                              <TableCell>{discrepancy.right.label}</TableCell>
                              <TableCell>
                                <strong className="capitalize">{discrepancy.result}</strong>
                                <div className="text-xs text-muted-foreground">
                                  {discrepancy.explanation}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableWrap>
                  </Card>
                  <p className="text-xs text-muted-foreground">
                    Comparisons are based on declarations and do not confirm the versions used at
                    runtime.
                  </p>
                </section>
              )}
              <Card>
                <TableWrap>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Component</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Basis</TableHead>
                        <TableHead>Cycle</TableHead>
                        <TableHead>Support ends</TableHead>
                        <TableHead>Time left</TableHead>
                        <TableHead>Migration suggestions</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleFindings.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9}>
                            No results for the selected statuses. Clear the selection to show all
                            results.
                          </TableCell>
                        </TableRow>
                      )}
                      {visibleFindings.map((f, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Badge variant={VARIANT[f.status]} dot>
                              {LABEL[f.status]}
                            </Badge>
                            {f.note && (
                              <div className="mt-1 text-xs text-muted-foreground">{f.note}</div>
                            )}
                          </TableCell>
                          <TableCell>{f.productLabel ?? f.component.label}</TableCell>
                          <TableCell>{f.component.version ?? '—'}</TableCell>
                          <TableCell>
                            <span title={versionBasisInfo(f.component).explanation}>
                              {versionBasisInfo(f.component).label}
                            </span>
                          </TableCell>
                          <TableCell>{f.cycle ?? '—'}</TableCell>
                          <TableCell>{f.eolFrom ?? '—'}</TableCell>
                          <TableCell>{formatDaysRemaining(f.daysRemaining)}</TableCell>
                          <TableCell>
                            {f.status === 'eol' || f.status === 'soon'
                              ? formatMigrationSuggestions(f.migrationSuggestions ?? [])
                              : '—'}
                          </TableCell>
                          <TableCell>{f.component.source}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrap>
              </Card>
              {findings.some(({ status }) => status === 'eol' || status === 'soon') && (
                <p className="text-xs text-muted-foreground">{MIGRATION_DISCLAIMER}</p>
              )}
              <div>
                <Button variant="secondary" onClick={copyMarkdown}>
                  {copied ? 'Copied' : 'Copy all results as Markdown'}
                </Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
