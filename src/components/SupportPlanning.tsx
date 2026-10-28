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
import { localIsoDate } from '../lib/status.ts';
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
  const { dated, undated } = supportEndingBy(findings, date);
  const todayDate = localIsoDate(today);
  const alreadyEnded = dated.filter((finding) => finding.eolFrom! <= todayDate).length;

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
      {date && dated.length === 0 && undated.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing loses support on or before {date}.</p>
      )}
      {date && dated.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            {dated.length} of {findings.length} results lose support on or before {date}
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
                  {dated.map((finding, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Badge variant={variants[finding.status]} dot>
                          {labels[finding.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{finding.productLabel ?? finding.component.label}</TableCell>
                      <TableCell>{finding.component.version ?? '—'}</TableCell>
                      <TableCell>{finding.cycle ?? '—'}</TableCell>
                      <TableCell>{finding.eolFrom}</TableCell>
                      <TableCell>{formatDaysRemaining(finding.daysRemaining)}</TableCell>
                      <TableCell>{finding.component.source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrap>
          </Card>
        </>
      )}
      {date && undated.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <h3 className="m-0 font-semibold">Already past end of support, date unknown</h3>
          <p className="m-0 text-muted-foreground">
            No end date is listed for these, so they cannot be placed relative to {date}:
          </p>
          <ul className="m-0 list-disc pl-5" aria-label="End date unknown">
            {undated.map((finding, index) => (
              <li key={index}>
                {finding.productLabel ?? finding.component.label} {finding.component.version ?? ''}{' '}
                <span className="text-muted-foreground">({finding.component.source})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
