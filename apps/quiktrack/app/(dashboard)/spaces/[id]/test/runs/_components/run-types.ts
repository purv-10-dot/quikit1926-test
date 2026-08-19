import type { StatusCounts } from "@/lib/test/statuses";

/** Shape returned by GET /api/test/runs, shared by the list and its rows. */
export interface RunRow {
  id: string;
  refId: number;
  name: string;
  source: string;
  state: string;
  build: string | null;
  environment: string | null;
  createdAt: string;
  closedAt: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Needed by the edit panel so it can prefill rather than blank the field. */
  description: string | null;
  refTickets: string | null;
  /** True in the "Deleted" view — drives Restore instead of Delete. */
  isDeleted: boolean;
  testCount: number;
  counts: StatusCounts;
  createdByUser: { id: string; firstName: string; lastName: string } | null;
  /** The run's owner (QtTestRun.assigneeId), not a per-test assignee. */
  owner: { id: string; firstName: string; lastName: string } | null;
}
