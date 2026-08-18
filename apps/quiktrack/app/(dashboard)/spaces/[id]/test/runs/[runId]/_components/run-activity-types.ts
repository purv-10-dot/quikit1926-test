/** Shape returned by GET /api/test/runs/{id}/activity. */

export interface ActivityCase {
  id: string;
  refId: number;
  title: string;
}

export interface ActivityEvent {
  id: string;
  executedAt: string;
  source: string;
  comment: string | null;
  elapsedMs: number | null;
  failureMessage: string | null;
  build: string | null;
  status: { id: string; key: string; label: string } | null;
  actor: { id: string; firstName: string; lastName: string } | null;
  testId: string;
  case: ActivityCase;
  defectIssueIds: string[];
}

export interface RunDefect {
  issueId: string;
  cases: ActivityCase[];
  issue: {
    id: string;
    key: string;
    title: string;
    priority: string;
    statusId: string;
  } | null;
}

export interface RunActivity {
  events: ActivityEvent[];
  defects: RunDefect[];
  total: number;
  /** True when the trail was cut at the endpoint's limit. */
  truncated: boolean;
}
