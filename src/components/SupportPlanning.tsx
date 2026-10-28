import {
  Badge,
  Button,
  Card,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from '@kjaniec-dev/ui';
import { endOfQuarter, formatDaysRemaining, supportEndingBy } from '../lib/planning.ts';
import type { Finding, Status } from '../lib/types.ts';

interface Props {
  findings: Finding[];
  today: Date;
  date: string;
  onDateChange: (date: string) => void;
  labels: Record<Status, string>;
  variants: Record<Status, 'danger' | 'warning' | 'success' | 'neutral'>;
}

export default function SupportPlanning({
  findings,
  today,
  date,
  onDateChange,
  labels,
  variants,
}: Props) {
  const affected = supportEndingBy(findings, date);
  const alreadyEnded = affected.filter((finding) => finding.status === 'eol').length;

  return (
    <section aria-label="Support planning" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Plan by date</h2>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Lose support by
          <Input
            type="date"
            aria-label="Planning date"
            className="w-44"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </label>
        <Button variant="secondary" onClick={() => onDateChange(endOfQuarter(today))}>
          End of this quarter
        </Button>
        {date && (
          <Button variant="secondary" onClick={() => onDateChange('')}>
            Clear date
          </Button>
        )}
      </div>
      {date &&
        (affected.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing loses support on or before {date}.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {affected.length} of {findings.length} results lose support on or before {date}
              {alreadyEnded > 0 ? `, ${alreadyEnded} already past end of support` : ''}.
            </p>
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
                      <TableHead>Time left</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {affected.map((finding, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Badge variant={variants[finding.status]} dot>
                            {labels[finding.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>{finding.productLabel ?? finding.component.label}</TableCell>
                        <TableCell>{finding.component.version ?? '—'}</TableCell>
                        <TableCell>{finding.cycle ?? '—'}</TableCell>
                        <TableCell>{finding.eolFrom ?? '—'}</TableCell>
                        <TableCell>{formatDaysRemaining(finding.daysRemaining)}</TableCell>
                        <TableCell>{finding.component.source}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrap>
            </Card>
          </>
        ))}
    </section>
  );
}
