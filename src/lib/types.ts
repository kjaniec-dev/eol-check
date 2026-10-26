export type ComponentKind = 'runtime' | 'framework' | 'image';

export type VersionBasis = 'declared' | 'minimum' | 'range' | 'lockfile' | 'image-reference';

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
  /** An un-digested container tag such as :8 or :8-alpine can follow newer minor cycles. */
  floatingMajorTag?: true;
}

export interface Release {
  name: string;
  isEol: boolean;
  eolFrom: string | null;
  isLts: boolean;
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
  /** Explanation of unknown results or inferred lifecycle cycles. */
  note: string | null;
}
