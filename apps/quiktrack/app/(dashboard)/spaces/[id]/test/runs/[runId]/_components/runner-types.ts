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

/** A row in the runner's left-hand work list. */
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
  };
  config: { id: string; name: string } | null;
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
    priority: string;
    type: string;
    automationId: string | null;
    currentVersion: number;
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
