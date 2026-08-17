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
  testCount: number;
  counts: StatusCounts;
  createdByUser: { id: string; firstName: string; lastName: string } | null;
}
