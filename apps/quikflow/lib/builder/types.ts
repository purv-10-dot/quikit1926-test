/** One row of a rule group: field + operator + value(s). */
export interface RuleRow {
  field?: string;
  operator?: string;
  value?: string;
  value2?: string;
  unit?: string;
}

/** A single builder step (shared between the builder page and its panels). */
export interface Step {
  id: string;
  kind: string;
  label: string;
  actionId?: string;
  // ── condition / if_else: a multi-row rule group joined by And / Or ──
  combine?: "and" | "or";
  rules?: RuleRow[];
  // ── action: param key → raw value (may hold {{tokens}} / relative dates) ──
  params?: Record<string, string>;
  // ── legacy single-clause condition (older drafts still render) ──
  field?: string;
  operator?: string;
  value?: string;
  value2?: string;
  unit?: string;
}

/** A saved rule group (trigger filter / condition) as persisted in config. */
export interface RuleGroupValue {
  combine: "and" | "or";
  rules: RuleRow[];
}

/** Recurrence config for a `schedule.tick` (time) trigger. */
export interface ScheduleValue {
  recurrence: "every_day" | "every_weekday" | "every_week" | "every_month" | "every_quarter" | "every_year";
  time: string; // "HH:MM"
  dayOfWeek?: string; // mon..sun (every_week)
  dayOfMonth?: number; // 1..28 (every_month)
}
