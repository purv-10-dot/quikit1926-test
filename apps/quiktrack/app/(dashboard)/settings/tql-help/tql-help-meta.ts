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

export interface ExampleQuery {
  query: string;
  description: string;
}

export interface ExampleCategory {
  category: string;
  examples: ExampleQuery[];
}

/**
 * Worked examples grouped by what they exercise, from single-clause basics
 * up to composite real-world queries and deliberately-invalid ones (so the
 * error-message behavior is documented, not just the happy path).
 */
export const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  {
    category: "Basic comparisons",
    examples: [
      { query: 'status = "Done"', description: "Exact status match." },
      { query: 'status != "Done"', description: "Everything except one status." },
      { query: 'priority = "HIGH"', description: "Exact priority match." },
      { query: "assignee = currentUser()", description: "Assigned to the logged-in user." },
      { query: "reporter = currentUser()", description: "Reported by the logged-in user." },
      { query: 'type = "BUG"', description: "Exact work-item type match." },
      { query: 'key = "QT-1"', description: "A single work item by key." },
    ],
  },
  {
    category: "IN / NOT IN",
    examples: [
      { query: 'status IN ("To Do", "In Progress")', description: "Matches any of several statuses." },
      { query: 'status NOT IN ("Done")', description: "Excludes one or more statuses." },
      { query: 'priority IN ("HIGH", "HIGHEST")', description: "Either of the two highest priorities." },
      { query: 'type IN ("BUG", "TASK", "STORY")', description: "Any of three work-item types." },
      { query: 'type NOT IN ("SUBTASK")', description: "Everything except subtasks." },
    ],
  },
  {
    category: "IS EMPTY / IS NOT EMPTY",
    examples: [
      { query: "assignee IS EMPTY", description: "Unassigned work." },
      { query: "assignee IS NOT EMPTY", description: "Assigned to someone." },
      { query: "resolution IS EMPTY", description: "Unresolved work." },
      { query: "resolution IS NOT EMPTY", description: "Resolved work, any resolution." },
      { query: "due IS EMPTY", description: "No due date set." },
      { query: "attachments IS EMPTY", description: "No files attached." },
      { query: "attachments IS NOT EMPTY", description: "Has at least one attachment." },
    ],
  },
  {
    category: "Text search",
    examples: [
      { query: 'summary ~ "login"', description: 'Summary contains "login".' },
      { query: 'summary !~ "login"', description: 'Summary does not contain "login".' },
      { query: 'description ~ "timeout"', description: 'Description contains "timeout".' },
      { query: 'text ~ "checkout"', description: "Searches title, description, and key at once." },
    ],
  },
  {
    category: "Dates — literal and relative",
    examples: [
      { query: 'created >= "2026-01-01"', description: "Created on/after a fixed ISO date." },
      { query: "created >= startOfWeek()", description: "Created since the start of this week." },
      { query: "created >= startOfMonth()", description: "Created since the start of this month." },
      { query: "created >= startOfYear()", description: "Created since the start of this year." },
      { query: "due <= endOfDay()", description: "Due today or earlier." },
      { query: 'due <= endOfDay("3")', description: "Due within the next 3 days." },
      { query: 'updated >= startOfDay("-7")', description: "Updated in the last 7 days." },
      {
        query: "created >= startOfMonth() AND created <= endOfMonth()",
        description: "Created within the current month, bounded on both ends.",
      },
    ],
  },
  {
    category: "AND / OR / NOT / grouping",
    examples: [
      { query: 'status = "Done" AND assignee = currentUser()', description: "Both conditions must hold." },
      { query: 'status = "Done" OR status = "Resolved"', description: "Either condition holds." },
      {
        query: '(status = "Done" OR status = "Resolved") AND assignee = currentUser()',
        description: "Parentheses group the OR before ANDing with assignee.",
      },
      { query: 'NOT (priority = "LOW" OR priority = "LOWEST")', description: "Negates an entire group." },
      { query: 'NOT (status = "Done")', description: "Negates a single parenthesized clause." },
      {
        query: "((status != \"Done\") AND (assignee IS EMPTY OR reporter = currentUser()))",
        description: "Nested groups for more complex logic.",
      },
    ],
  },
  {
    category: "ORDER BY",
    examples: [
      { query: "ORDER BY updated DESC", description: "Sort only, no filter — most recently updated first." },
      { query: "ORDER BY created DESC", description: "Newest first." },
      { query: 'status != "Done" ORDER BY priority DESC', description: "Filter, then sort by one field." },
      {
        query: 'status != "Done" ORDER BY priority DESC, updated DESC',
        description: "Sort by multiple fields — priority first, then updated as a tiebreaker.",
      },
      { query: "ORDER BY key ASC", description: "Ascending sort (the default direction if omitted)." },
    ],
  },
  {
    category: 'Custom fields — cf[...]',
    examples: [
      { query: 'cf["Customer Tier"] = "Gold"', description: "Custom field matched by name." },
      { query: 'cf["Customer Tier"] != "Gold"', description: "Custom field, negated." },
      { query: 'cf[42] = "Gold"', description: "Custom field matched by its id instead of name." },
      { query: 'cf["Customer Tier"] IN ("Gold", "Silver")', description: "Custom field with a value list." },
      { query: 'cf["Customer Tier"] IS EMPTY', description: "Custom field has no value set." },
      { query: 'cf["Story Points Estimate"] > 5', description: "Numeric comparison on a Number-type custom field." },
      { query: 'cf["Story Points Estimate"] >= 3', description: "Inclusive numeric comparison." },
      { query: 'cf["Due Reminder"] < "2026-12-31"', description: "Date comparison on a Date-type custom field." },
    ],
  },
  {
    category: "Relationship fields",
    examples: [
      { query: 'parent = "QT-10"', description: "Subtasks of a specific parent issue." },
      { query: 'sprint = "sprint-id-or-name"', description: "Work items in a specific sprint." },
      { query: 'workItemLink IN ("blocks")', description: "Work items linked with a given link type." },
    ],
  },
  {
    category: "Real-world composite queries",
    examples: [
      {
        query: 'status != "Done" AND assignee = currentUser() ORDER BY updated DESC',
        description: "Your own open work, most recently updated first.",
      },
      { query: "assignee IS EMPTY AND resolution IS EMPTY", description: "Unassigned, unresolved work — a common triage view." },
      { query: "reporter = currentUser() AND created >= startOfMonth()", description: "Things you reported this month." },
      {
        query: 'priority IN ("HIGH", "HIGHEST") AND resolution IS EMPTY ORDER BY priority DESC',
        description: "Unresolved high-priority work, most urgent first.",
      },
      {
        query: 'type != "SUBTASK" AND (summary ~ "crash" OR description ~ "crash")',
        description: 'Non-subtask work mentioning "crash" in either field.',
      },
      {
        query: 'cf["Customer Tier"] = "Gold" AND status != "Done" AND assignee IS NOT EMPTY',
        description: "Open, assigned work for Gold-tier customers.",
      },
    ],
  },
  {
    category: "Deliberately invalid — confirms error handling",
    examples: [
      { query: "status =", description: "Dangling operator with no value — a clear parse error." },
      {
        query: '(status = "Done" AND assignee = currentUser()',
        description: "Unmatched opening parenthesis.",
      },
      { query: 'status NOT = "Done"', description: '"NOT" must be followed by "IN", not another operator.' },
      {
        query: 'labels = "urgent"',
        description:
          'Errors — "labels" has no native column. If this org has a Labels-type custom field, use cf["Labels"] = "urgent" instead.',
      },
      { query: 'cf["Nonexistent Field"] = "x"', description: "Errors clearly when the custom field name doesn't exist." },
      { query: 'status > "Done"', description: "Errors — status only supports =, !=, IN, NOT IN, IS EMPTY, IS NOT EMPTY." },
    ],
  },
];
