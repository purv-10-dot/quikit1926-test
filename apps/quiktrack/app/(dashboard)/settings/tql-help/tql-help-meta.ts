/**
 * Static content for the Settings → TQL Documentation page. Field support is
 * imported from lib/tql/fields.ts (the translator's own source of truth) so
 * this page can never claim support that the engine doesn't actually have;
 * everything else here (operators/keywords/functions/examples) is
 * hand-authored documentation of lib/tql's actual grammar (tokenizer.ts /
 * parser.ts / translator.ts / functions.ts).
 */
import { NATIVE_FIELDS, UNSUPPORTED_FIELDS, type NativeFieldKind } from "@/lib/tql/fields";

export interface SupportedFieldRow {
  field: string;
  operators: string;
  notes: string;
}

const KIND_OPERATORS: Record<NativeFieldKind, string> = {
  equality: "=, !=, IN, NOT IN, IS EMPTY, IS NOT EMPTY",
  text: "~, !~",
  textSearch: "~, !~",
  date: "=, !=, >, <, >=, <=, IS EMPTY, IS NOT EMPTY",
  link: "IN, NOT IN",
  attachment: "IS EMPTY, IS NOT EMPTY",
};

const KIND_NOTES: Record<NativeFieldKind, string> = {
  equality: "Exact match against the stored value (status/sprint names match case-insensitively).",
  text: "Case-insensitive contains/not-contains against a single column.",
  textSearch: 'OR-searches title, description, and key — comments are not included (see "Not supported" below).',
  date: "Accepts an ISO date/datetime literal or a date function (see Functions).",
  link: "Matches QtIssueLink.type — this org's own link-type strings, not a fixed catalog.",
  attachment: "Only presence/absence — filtering by filename or size isn't supported.",
};

/** Built from lib/tql/fields.ts — cannot list a field TQL doesn't actually parse. */
export const SUPPORTED_FIELDS: SupportedFieldRow[] = Object.values(NATIVE_FIELDS)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((spec) => ({
    field: spec.name,
    operators: KIND_OPERATORS[spec.kind],
    notes: `${KIND_NOTES[spec.kind]}${spec.sortable ? " Sortable." : ""}`,
  }));

export const CUSTOM_FIELD_ROW: SupportedFieldRow = {
  field: 'cf[id] or cf["Field Name"]',
  operators: "=, !=, ~ (text types), IN, NOT IN, IS EMPTY, IS NOT EMPTY",
  notes:
    "Matches a custom field by id or by name. Which operators actually apply depends on the field's type (e.g. a Number field doesn't support ~). A Labels-type custom field is reached this way — there's no bare \"labels\" keyword.",
};

export interface UnsupportedFieldRow {
  field: string;
  reason: string;
}

/** Same UNSUPPORTED_FIELDS map the translator uses to reject these fields. */
export const UNSUPPORTED_FIELD_ROWS: UnsupportedFieldRow[] = Object.entries(UNSUPPORTED_FIELDS)
  .map(([field, reason]) => ({ field, reason }))
  .sort((a, b) => a.field.localeCompare(b.field));

export const OPERATORS: { op: string; meaning: string }[] = [
  { op: "=", meaning: "Exact match." },
  { op: "!=", meaning: "Does not exactly match." },
  { op: "~", meaning: "Contains (case-insensitive). Only on summary, description, text, and text-type custom fields." },
  { op: "!~", meaning: "Does not contain." },
  { op: ">, >=, <, <=", meaning: "Comparison — dates (created, updated, due, startDate) and numeric custom fields." },
  { op: "IN (...) / NOT IN (...)", meaning: "Matches or excludes any value in a list." },
  { op: "IS EMPTY / IS NOT EMPTY", meaning: "Tests whether a field has no value (also accepts IS NULL / IS NOT NULL)." },
];

export const KEYWORDS: { keyword: string; meaning: string }[] = [
  { keyword: "AND / OR", meaning: "Joins clauses. AND binds tighter than OR — use parentheses to override." },
  { keyword: "NOT", meaning: "Negates the clause or parenthesized group that follows it." },
  { keyword: "EMPTY / NULL", meaning: "Used after IS / IS NOT — interchangeable." },
  { keyword: "ORDER BY", meaning: "Sorts results. Supports multiple fields, each with an optional ASC | DESC (default ASC)." },
];

export const FUNCTIONS: { fn: string; returns: string }[] = [
  { fn: "currentUser()", returns: "The logged-in user — usable with assignee or reporter." },
  { fn: "now()", returns: "The current date and time." },
  { fn: 'startOfDay() / endOfDay(["-1"])', returns: "Start/end of today (UTC). Optional integer-day offset argument." },
  { fn: "startOfWeek() / endOfWeek()", returns: "Start/end of the current week (UTC, week starts Sunday)." },
  { fn: "startOfMonth() / endOfMonth()", returns: "Start/end of the current month (UTC)." },
  { fn: "startOfYear() / endOfYear()", returns: "Start/end of the current year (UTC)." },
];

export const EXAMPLES: { query: string; description: string }[] = [
  {
    query: 'status != "Done" AND assignee = currentUser() ORDER BY updated DESC',
    description: "Your own open work, most recently updated first.",
  },
  {
    query: 'project = "<project id>" AND priority IN ("HIGH", "HIGHEST")',
    description: "High-priority work in a specific project.",
  },
  {
    query: 'created >= startOfWeek() AND type != "SUBTASK"',
    description: "Everything created so far this week, excluding subtasks.",
  },
  {
    query: "assignee IS EMPTY AND resolution IS EMPTY",
    description: "Unassigned, unresolved work — a common triage view.",
  },
  {
    query: 'cf["Customer Tier"] = "Gold" AND status != "Done"',
    description: 'Open work where the "Customer Tier" custom field is "Gold".',
  },
  {
    query: 'summary ~ "login" OR description ~ "login"',
    description: "Free-text search across summary and description independently.",
  },
  {
    query: 'due <= endOfDay("3") AND resolution IS EMPTY',
    description: "Unresolved work due within the next 3 days.",
  },
  {
    query: 'labels = "urgent"',
    description:
      'Will error — "labels" has no native column. If this org has a Labels-type custom field, use cf["Labels"] = "urgent" instead.',
  },
];
