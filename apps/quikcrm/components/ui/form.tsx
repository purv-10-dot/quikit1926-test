import type { ReactNode } from "react";

/**
 * Form-layout primitives. Purely presentational — they own breakpoints + 8px
 * spacing rhythm so individual forms don't reinvent grid math.
 *
 *   <FormGrid cols={2}>
 *     <FormField label="Name *">…</FormField>
 *     <FormField label="Owner">…</FormField>
 *     <FormFullRow><FormField label="Notes">…</FormField></FormFullRow>
 *   </FormGrid>
 *
 * Existing forms with their own local <Field> can still wrap full-row fields
 * with <FormFullRow> (or apply `md:col-span-full` directly).
 */

const COLS = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
} as const;

type Cols = keyof typeof COLS;

/**
 * Responsive form grid. 1 column on `<md`, `cols` columns on `md+`.
 * Default gap is 16px (gap-4) on `<md` and 20px (md:gap-5) on `md+`, matching
 * the 8px spacing rhythm used elsewhere in the CRM.
 */
export function FormGrid({
  cols = 2,
  className = "",
  children,
}: {
  cols?: Cols;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${COLS[cols]} md:gap-5 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Marks a child as full-row inside a `<FormGrid>`. Uses `col-span-full` so it
 * works regardless of whether the parent grid is 2 or 3 columns.
 */
export function FormFullRow({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={`md:col-span-full ${className}`}>{children}</div>;
}

/**
 * Optional standard <label> + input wrapper. Forms with custom Field components
 * can keep using those; new forms should default to this one.
 */
export function FormField({
  label,
  required,
  error,
  help,
  action,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  help?: string;
  /** Right-aligned slot in the label row (e.g. "+ Add option" link). */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 flex items-center justify-between gap-2 text-sm font-medium text-crm-text">
        <span className="truncate">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </span>
        {action}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11px] text-red-600">{error}</span>}
      {!error && help && (
        <span className="mt-1 block text-[11px] text-crm-muted">{help}</span>
      )}
    </label>
  );
}

/**
 * Footer action bar for forms / drawers / modals.
 * - On `<sm`: stacked, primary action on top (it's the last child by convention,
 *   `flex-col-reverse` brings it up to be closest to the thumb on mobile sheets).
 * - On `sm+`: right-aligned inline row. An optional error message sits on the left.
 */
export function FormActions({
  error,
  className = "",
  children,
}: {
  error?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end ${className}`}
    >
      {error && (
        <span className="text-xs text-red-600 sm:mr-auto sm:order-first">
          {error}
        </span>
      )}
      {children}
    </div>
  );
}
