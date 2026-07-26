/**
 * Relative-date trigger rules (Phase S2). QuikFlow's scheduler scans QuikScale
 * records for upcoming/past dates and fires these events (Deep-Analysis §4:
 * "due date reached / N days before / overdue"). Declarative + pure (no DB) so
 * it's safe in the client bundle and unit-testable; the scanner
 * (worker/date-scan.ts) reads the DB via these rules.
 *
 * To add a module: append a rule with its Prisma model + date column. WWW is
 * wired first (real `when` DateTime). Priority/OPSP due dates are derived from
 * the fiscal calendar / finalize settings and are a follow-up.
 */
export interface DateRule {
  /** The trigger event id this rule fires. */
  event: string;
  moduleKey: string;
  /** Prisma delegate accessor (e.g. "wWWItem"). */
  model: string;
  /** Date column to compare. */
  dateColumn: string;
  /** "before" = fires N days before the date; "overdue" = fires once past it. */
  mode: "before" | "overdue";
  softDelete?: boolean;
  /** Column + values to exclude (e.g. don't nag a completed item). */
  excludeStatusColumn?: string;
  excludeStatusValues?: string[];
  /** Default offset for "before" when the workflow didn't set one. */
  defaultOffsetDays?: number;
}

export const DATE_RULES: DateRule[] = [
  {
    event: "www.due.approaching",
    moduleKey: "www",
    model: "wWWItem",
    dateColumn: "when",
    mode: "before",
    softDelete: true,
    excludeStatusColumn: "status",
    excludeStatusValues: ["completed"],
    defaultOffsetDays: 3,
  },
  {
    event: "www.overdue",
    moduleKey: "www",
    model: "wWWItem",
    dateColumn: "when",
    mode: "overdue",
    softDelete: true,
    excludeStatusColumn: "status",
    excludeStatusValues: ["completed"],
  },
];

export function dateRuleFor(event: string): DateRule | undefined {
  return DATE_RULES.find((r) => r.event === event);
}

export const DATE_RULE_EVENTS: string[] = DATE_RULES.map((r) => r.event);

/** True when the event is a "N days before" rule (needs an offset input). */
export function isBeforeDateEvent(event: string): boolean {
  return dateRuleFor(event)?.mode === "before";
}
