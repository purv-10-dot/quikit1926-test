import { normaliseHeader, type RawRow } from "./importParse";
import { parseEstimate } from "./estimate";

/**
 * Maps spreadsheet rows onto test cases, and validates them.
 *
 * Kept separate from parsing and from the API so the rules are testable without a
 * file or a database: an importer that silently mis-assigns a column is worse than
 * one that refuses, so every decision here is explicit.
 */

/** Columns the importer understands. First alias is the canonical header. */
export const IMPORT_COLUMNS = {
  title: ["Title", "Test Case Title", "Name", "Summary"],
  section: ["Section", "Folder", "Suite Section"],
  priority: ["Priority"],
  type: ["Type", "Test Type"],
  preconditions: ["Preconditions", "Pre-conditions", "Precondition"],
  steps: ["Steps", "Test Steps", "Step"],
  expected: ["Expected Result", "Expected", "Expected Results"],
  estimate: ["Estimate"],
  automation: ["Automation", "Is Automated", "Automation Status"],
  automationId: ["Automation ID", "AutomationId"],
  references: ["References", "Refs"],
  description: ["Description"],
} as const;

export type ImportColumn = keyof typeof IMPORT_COLUMNS;

/** Header aliases → canonical column, all normalised. */
const ALIAS_TO_COLUMN = new Map<string, ImportColumn>();
for (const [col, aliases] of Object.entries(IMPORT_COLUMNS)) {
  for (const a of aliases) ALIAS_TO_COLUMN.set(normaliseHeader(a), col as ImportColumn);
}

function pick(row: RawRow, col: ImportColumn): string {
  for (const alias of IMPORT_COLUMNS[col]) {
    const v = row[normaliseHeader(alias)];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

/** Vocabularies. Import is forgiving about case and spacing, strict about values. */
const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "LOWEST"];
const TYPES = [
  "FUNCTIONAL", "REGRESSION", "SMOKE", "UAT", "SECURITY",
  "PERFORMANCE", "COMPATIBILITY", "NEGATIVE", "BDD", "EXPLORATORY",
];

function normaliseEnum(value: string, allowed: string[]): string | null {
  if (!value) return null;
  const v = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return allowed.includes(v) ? v : null;
}

export interface ParsedStep {
  action: string;
  expected: string;
}

/**
 * Splits a steps cell into individual steps.
 *
 * Accepts newline-separated steps, optionally numbered ("1." / "1)" / "-"), and
 * `action => expected` or `action | expected` on a line to give that step its own
 * expectation. Anything unrecognised becomes a single step, which is better than
 * dropping the text.
 */
export function parseSteps(cell: string): ParsedStep[] {
  if (!cell.trim()) return [];

  return cell
    .split(/\r?\n/)
    .map((line) => line.trim())
    // Strip a leading "1." / "1)" / "*" / "-" bullet.
    .map((line) => line.replace(/^(\d+[.)]\s*|[-*•]\s*)/, "").trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const split = line.split(/\s*(?:=>|->|\|)\s*/);
      if (split.length >= 2) {
        return { action: split[0].trim(), expected: split.slice(1).join(" ").trim() };
      }
      return { action: line, expected: "" };
    })
    .filter((s) => s.action.length > 0);
}

/**
 * Splits a Section cell into a folder path.
 *
 * "Login / Errors" nests Errors under Login. Blank means "use the folder the user
 * opened Import from", which is the owner's chosen behaviour.
 */
export function parseSectionPath(cell: string): string[] {
  return cell
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface MappedCase {
  /** 1-based row number in the FILE (header is row 1), for error messages. */
  rowNumber: number;
  title: string;
  sectionPath: string[];
  description: string | null;
  preconditions: string | null;
  expectedResult: string | null;
  priority: string;
  type: string;
  automationStatus: string;
  automationId: string | null;
  refTickets: string | null;
  estimateMs: number | null;
  steps: ParsedStep[];
}

export interface RowIssue {
  rowNumber: number;
  /** Blocks import of this row. Warnings do not. */
  severity: "error" | "warning";
  message: string;
}

export interface MapResult {
  cases: MappedCase[];
  issues: RowIssue[];
  /** Headers present in the file that the importer does not use. */
  unknownHeaders: string[];
}

export function mapRows(rows: RawRow[], headers: string[]): MapResult {
  const cases: MappedCase[] = [];
  const issues: RowIssue[] = [];

  const unknownHeaders = headers
    .filter((h) => h.trim().length > 0)
    .filter((h) => !ALIAS_TO_COLUMN.has(normaliseHeader(h)));

  // Duplicate titles WITHIN the file are flagged: two identical cases is almost
  // always a copy-paste slip, and the DB has no unique constraint to catch it.
  const seenTitles = new Map<string, number>();

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for header, +1 for 1-based
    const title = pick(row, "title");

    if (!title) {
      issues.push({ rowNumber, severity: "error", message: "Title is required." });
      return;
    }
    if (title.length > 255) {
      issues.push({
        rowNumber,
        severity: "error",
        message: `Title is ${title.length} characters; the limit is 255.`,
      });
      return;
    }

    const dupeOf = seenTitles.get(title.toLowerCase());
    if (dupeOf) {
      issues.push({
        rowNumber,
        severity: "warning",
        message: `Same title as row ${dupeOf}. Both will be imported.`,
      });
    } else {
      seenTitles.set(title.toLowerCase(), rowNumber);
    }

    const rawPriority = pick(row, "priority");
    const priority = normaliseEnum(rawPriority, PRIORITIES);
    if (rawPriority && !priority) {
      issues.push({
        rowNumber,
        severity: "warning",
        message: `Priority "${rawPriority}" is not recognised; using Medium.`,
      });
    }

    const rawType = pick(row, "type");
    const type = normaliseEnum(rawType, TYPES);
    if (rawType && !type) {
      issues.push({
        rowNumber,
        severity: "warning",
        message: `Type "${rawType}" is not recognised; using Functional.`,
      });
    }

    const rawEstimate = pick(row, "estimate");
    const estimateMs = rawEstimate ? parseEstimate(rawEstimate) : null;
    if (rawEstimate && estimateMs === null) {
      issues.push({
        rowNumber,
        severity: "warning",
        message: `Estimate "${rawEstimate}" is not a duration like 30m or 1h30m; leaving it empty.`,
      });
    }

    const rawAutomation = pick(row, "automation").trim().toLowerCase();
    const automated = ["automated", "yes", "true", "y", "1"].includes(rawAutomation);
    const automationId = pick(row, "automationId") || null;

    // A case with an automation id but marked manual is contradictory. Trusting the
    // id is the safer read (someone filled it in deliberately), but say so.
    let automationStatus = automated ? "AUTOMATED" : "MANUAL";
    if (!automated && automationId) {
      automationStatus = "AUTOMATED";
      issues.push({
        rowNumber,
        severity: "warning",
        message: "Has an Automation ID, so it was imported as Automated.",
      });
    }

    cases.push({
      rowNumber,
      title,
      sectionPath: parseSectionPath(pick(row, "section")),
      description: pick(row, "description") || null,
      preconditions: pick(row, "preconditions") || null,
      expectedResult: pick(row, "expected") || null,
      priority: priority ?? "MEDIUM",
      type: type ?? "FUNCTIONAL",
      automationStatus,
      automationId,
      refTickets: pick(row, "references") || null,
      estimateMs,
      steps: parseSteps(pick(row, "steps")),
    });
  });

  return { cases, issues, unknownHeaders };
}

/** The sample file offered in the modal. Real content, not lorem ipsum. */
export const SAMPLE_CSV = `Title,Section,Priority,Type,Preconditions,Steps,Expected Result,Estimate,Automation,Automation ID,References
"User can log in with valid credentials",Login,High,Functional,"A verified account exists","1. Open /login
2. Enter valid email and password => Form accepts input
3. Submit","Dashboard loads and the user's name is shown",5m,Manual,,
"Locked account shows a clear message","Login / Errors",Medium,Negative,"Account locked after 5 failed attempts","1. Open /login
2. Submit credentials for the locked account","A message explains the account is locked, not 'wrong password'",3m,Manual,,QUIKTR-114
"Password reset email arrives within 60 seconds",Login,High,Functional,"A verified email address exists","1. Open /forgot-password
2. Submit the account email
3. Check the inbox","A reset email arrives and the link opens the set-password page",10m,Automated,auth.spec.ts::password_reset_email,
`;
