export type ComponentKind = 'runtime' | 'framework' | 'image';

export type VersionBasis =
  'declared' | 'minimum' | 'range' | 'lockfile' | 'image-reference' | 'target-framework';

export interface Component {
  /** Which file type produced this entry, e.g. "Dockerfile". */
  source: string;
  kind: ComponentKind;
  /** Name as written in the file, e.g. "node:18-alpine" or "react". */
  label: string;
  /** endoflife.date product slug, or null when we don't know the product. */
  product: string | null;
  /** Known product name, including products without upstream lifecycle data. */
  productLabel?: string;
  /** Version as written/extracted, or null when unpinned (latest, unresolved ARG, ...). */
  version: string | null;
  /** Where the version used for this check came from. */
  versionBasis?: VersionBasis;
  /** Original npm constraint, retained for cross-file compatibility checks. */
  versionRange?: string;
  /** An un-digested container tag such as :8 or :8-alpine can follow newer minor cycles. */
  floatingMajorTag?: true;
  /** User-assigned comparison scope; defaults are applied by the checker UI. */
  application?: string;
  environment?: string;
  /** Distinguishes separate uploaded inputs even if their displayed filenames match. */
  inputId?: string;
}

export interface Release {
  name: string;
  isEol: boolean;
  eolFrom: string | null;
  isLts: boolean;
  releaseDate?: string | null;
}

export interface MigrationSuggestion {
  cycle: string;
  isLts: boolean;
  eolFrom: string | null;
  supportDaysRemaining: number | null;
}

export interface Product {
  label: string;
  releases: Release[];
}

export interface Dataset {
  generatedAt: string;
  products: Record<string, Product>;
}

export type Status = 'eol' | 'soon' | 'ok' | 'unknown';

export interface Finding {
  component: Component;
  status: Status;
  productLabel: string | null;
  cycle: string | null;
  eolFrom: string | null;
  /** Whole days until support ends; negative once it has ended, null without a date. */
  daysRemaining: number | null;
  /** Explanation of unknown results or inferred lifecycle cycles. */
  note: string | null;
  migrationSuggestions?: MigrationSuggestion[];
}

export type DiscrepancyResult = 'conflict' | 'compatible' | 'unknown';

export interface CrossFileDiscrepancy {
  product: string;
  productLabel: string;
  application: string;
  environment: string;
  left: Component;
  right: Component;
  result: DiscrepancyResult;
  explanation: string;
}
