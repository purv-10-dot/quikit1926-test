/** Shared shapes for the three-pane runner. */

export interface TestStatusLite {
  id: string;
  key: string;
  label: string;
  color: string;
  isFinal?: boolean;
  isDefault?: boolean;
  isAutomation?: boolean;
  orderNo?: number;
}

export interface RunnerCaseLabel {
  id: string;
  name: string;
  color: string | null;
}

/** A row in the runner's grid (QUIKTR-341). */
export interface RunnerTest {
  id: string;
  refId: number;
  caseVersion: number;
  assigneeId: string | null;
  currentStatus: TestStatusLite;
  case: {
    id: string;
    refId: number;
    title: string;
    priority: string;
    type: string;
    labels: RunnerCaseLabel[];
    /** The folder this case lives in — QUIKTR-341 section grouping. */
    section: { id: string; name: string };
  };
  config: { id: string; name: string } | null;
  /** True once ANY result has ever been recorded for this test — QUIKTR-341's
   *  edit-run "Select cases" modal uses this to decide whether the case can be
   *  removed. The server independently re-verifies this before deleting; it
   *  is not itself trusted for that decision. */
  hasResults?: boolean;
}

export interface RunnerStep {
  /** Null when the pinned step no longer exists as a live row. */
  id: string | null;
  orderNo: number;
  action: string;
  expected: string | null;
}

/** The middle pane's payload — one test, with steps AS EXECUTED. */
export interface TestDetail {
  id: string;
  refId: number;
  caseVersion: number;
  /** Per-execution owner (QUIKTR-317) — a case can have a different tester in
   *  each run, which is why this is on the test, not the case. */
  assigneeId: string | null;
  currentStatus: TestStatusLite;
  config: { id: string; name: string } | null;
  run: {
    id: string;
    refId: number;
    name: string;
    state: string;
    build: string | null;
    environment: string | null;
    projectId: string;
  };
  case: {
    id: string;
    refId: number;
    title: string;
    description: string | null;
    preconditions: string | null;
    /** Case-level Expected Result — the TEXT/BDD templates' authored body. */
    expectedResult: string | null;
    /** TEXT | STEPS | BDD | EXPLORATORY — decides which body the runner shows. */
    templateKind: string | null;
    priority: string;
    type: string;
    automationId: string | null;
    /** MANUAL | AUTOMATED — the detail panel's "IS AUTOMATED" field. */
    automationStatus: string;
    /** Harness name (Playwright, Cypress, …) — "AUTOMATION TYPE". Null for a
     *  manual case. */
    automationTool: string | null;
    currentVersion: number;
    labels: RunnerCaseLabel[];
  };
  steps: RunnerStep[];
  stepsSource: "pinned" | "live";
  caseHasNewerVersion: boolean;
}

export interface RunSummaryData {
  id: string;
  refId: number;
  name: string;
  state: string;
  source: string;
  build: string | null;
  environment: string | null;
  counts: Record<string, number>;
  /** Run owner (QUIKTR-317), not a per-test assignee. */
  owner: { id: string; firstName: string; lastName: string } | null;
}

/** Display id for a test — the reference UI's `T106`. */
export function testRef(refId: number): string {
  return `T${refId}`;
}

/** Display id for a run — the reference UI's `R13`. */
export function runRef(refId: number): string {
  return `R${refId}`;
}

/** Formats an elapsed millisecond count as `1m 04s` / `4.2s`. */
export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
