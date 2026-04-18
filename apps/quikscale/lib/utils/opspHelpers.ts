/**
 * OPSP pure helper functions.
 *
 * Extracted from `app/(dashboard)/opsp/page.tsx` (1891 lines) in a safe,
 * incremental pass ahead of the full decomposition documented in
 * `docs/audit/OPSP_DECOMP_PLAN.md`.
 *
 * Scope constraint: this file is *only* for pure helpers — no React, no
 * DOM APIs, no module-level side effects. Anything that touches hooks,
 * fetch, or state belongs in the page component or a future dedicated
 * module (ObjectivesSection.tsx, SetupWizardHost.tsx, etc.).
 *
 * Why extraction matters: the OPSP page must hit >=50% coverage before
 * the big decomp per CLAUDE.md's testing standard. These helpers are the
 * easiest wins — they unit-test cleanly with no mocks.
 */
import type {
  TargetRow,
  GoalRow,
  ThrustRow,
  KeyInitiativeRow,
  RockRow,
  ActionRow,
  KPIAcctRow,
  QPriorRow,
  CritCard,
} from "@/app/(dashboard)/opsp/types";

/** 3 empty strings — used for employees / customers / shareholders / processItems etc. */
export const emptyArr3 = (): string[] => ["", "", ""];

/** 5 empty strings — used for the "actions" (top-left, numbered 1-5). */
export const emptyArr5 = (): string[] => ["", "", "", "", ""];

/** An empty critical-number card (title + 4 colored bullets). */
export const emptyCrit = (): CritCard => ({
  title: "",
  bullets: ["", "", "", ""],
});

/** 5 empty target rows (5-year plan table). */
export const emptyTarget = (): TargetRow[] =>
  Array.from({ length: 5 }, () => ({
    category: "",
    projected: "",
    y1: "",
    y2: "",
    y3: "",
    y4: "",
    y5: "",
  }));

/** 6 empty goal rows (annual goals table, one more row than targets for balancing). */
export const emptyGoal = (): GoalRow[] =>
  Array.from({ length: 6 }, () => ({
    category: "",
    projected: "",
    q1: "",
    q2: "",
    q3: "",
    q4: "",
  }));

/** 5 empty key-thrust rows (desc + owner). */
export const emptyThrust = (): ThrustRow[] =>
  Array.from({ length: 5 }, () => ({ desc: "", owner: "" }));

/** 5 empty key-initiative rows (desc + owner). */
export const emptyKeyInitiatives = (): KeyInitiativeRow[] =>
  Array.from({ length: 5 }, () => ({ desc: "", owner: "" }));

/** 5 empty quarterly-rock rows (desc + owner). */
export const emptyRocks = (): RockRow[] =>
  Array.from({ length: 5 }, () => ({ desc: "", owner: "" }));

/** 6 empty quarterly-action rows (category, projected, m1, m2, m3). */
export const emptyAction = (): ActionRow[] =>
  Array.from({ length: 6 }, () => ({
    category: "",
    projected: "",
    m1: "",
    m2: "",
    m3: "",
  }));

/** 5 empty KPI-accountability rows (kpi + goal). */
export const emptyKPI = (): KPIAcctRow[] =>
  Array.from({ length: 5 }, () => ({ kpi: "", goal: "" }));

/** 5 empty quarterly-priority rows (priority + due date). */
export const emptyQP = (): QPriorRow[] =>
  Array.from({ length: 5 }, () => ({ priority: "", dueDate: "" }));

/**
 * Parse a `year` URL param safely. Returns `null` on missing, empty, NaN,
 * non-numeric, or negative values — caller should fall back to
 * `getFiscalYear()` (or equivalent) when null is returned.
 *
 * Matches the inline `parseInt(urlYear) || base.year` guard that previously
 * lived in `useState` initializer of the OPSP page.
 */
export function parseUrlYear(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Parse a `quarter` URL param safely. Returns "Q1" | "Q2" | "Q3" | "Q4" or
 * `null` for anything else (unknown string, missing, wrong case, etc.).
 */
export function parseUrlQuarter(
  raw: string | null | undefined
): "Q1" | "Q2" | "Q3" | "Q4" | null {
  if (raw === "Q1" || raw === "Q2" || raw === "Q3" || raw === "Q4") return raw;
  return null;
}

/**
 * Format an ISO `YYYY-MM-DD` date string as US-style `MM/DD/YYYY` for
 * display in the OPSP preview. Empty / invalid input is returned as-is
 * (matches the original behavior of `fmtDue`).
 */
export function formatDueDate(d: string | null | undefined): string {
  if (!d) return "";
  try {
    const dt = new Date(d + "T00:00");
    if (isNaN(dt.getTime())) return d;
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    const yyyy = dt.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  } catch {
    return d;
  }
}

/**
 * Strip HTML tags from a RichEditor value for Word export. Never returns
 * an empty string — callers need at least one space so `docx` doesn't
 * throw on empty `TextRun` payloads.
 */
export function stripHtml(html: string | null | undefined): string {
  return (html || "").replace(/<[^>]*>/g, "").trim() || " ";
}

/**
 * Resolve an owner ID to a "First Last" display name against a users
 * array. Returns an empty string if the ID is missing, or returns the
 * raw ID as a fallback if no user matches (for historical owners who
 * may have been deleted).
 */
export interface OwnerUser {
  id: string;
  firstName: string;
  lastName: string;
}
export function resolveOwnerName(
  id: string | null | undefined,
  users: ReadonlyArray<OwnerUser>
): string {
  if (!id) return "";
  const u = users.find((x) => x.id === id);
  return u ? `${u.firstName} ${u.lastName}` : id;
}
