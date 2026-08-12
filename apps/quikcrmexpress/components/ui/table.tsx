import type {
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

/** Tailwind breakpoint at which a column appears. Below this, the cell is hidden. */
export type HideBelow = "sm" | "md" | "lg" | "xl";

// Literal classes so Tailwind's JIT picks them up. Do NOT template these.
const HIDE_BELOW: Record<HideBelow, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

function hideClass(hideBelow?: HideBelow): string {
  return hideBelow ? HIDE_BELOW[hideBelow] : "";
}

function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

export function Table({ className = "", ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cx("crm-table", className)} {...rest} />;
}
export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}
export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}
export function TR(props: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} />;
}

interface ResponsiveCellProps {
  /** Hide this column below the given breakpoint to free up horizontal space. */
  hideBelow?: HideBelow;
}

export function TH({
  hideBelow,
  className = "",
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & ResponsiveCellProps) {
  return <th className={cx(hideClass(hideBelow), className)} {...rest} />;
}

export function TD({
  hideBelow,
  className = "",
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & ResponsiveCellProps) {
  return <td className={cx(hideClass(hideBelow), className)} {...rest} />;
}

/**
 * Responsive horizontal-scroll wrapper for tables. Bleeds to the viewport edge
 * on `<sm` so the page padding doesn't add a wasted gutter, and forces a
 * sensible min-width on the table so cells don't crush before scroll kicks in.
 *
 *   <TableScroll minWidth={720}>
 *     <Table>...</Table>
 *   </TableScroll>
 */
export function TableScroll({
  children,
  minWidth = 640,
  className = "",
  bleed = true,
}: {
  children: ReactNode;
  /** Forced min-width of the inner table in px. Below this width, scroll engages. */
  minWidth?: number;
  className?: string;
  /** When true, the wrapper extends to the viewport edge on small screens. */
  bleed?: boolean;
}) {
  return (
    <div
      className={cx(
        bleed ? "-mx-4 sm:mx-0" : "",
        "crm-hscroll overflow-x-auto",
        className,
      )}
    >
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}
