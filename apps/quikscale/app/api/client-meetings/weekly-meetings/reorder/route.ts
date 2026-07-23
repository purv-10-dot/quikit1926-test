import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { handleReorder } from "@/lib/api/handleReorder";
import type { OrderableDelegate } from "@/lib/api/reorderRow";

const withOrgAuth = withOrgAuthForModule("clientMeetings.weeklyMeeting");

// POST /api/client-meetings/weekly-meetings/reorder — move a ClientWeeklyMeeting row.
export const POST = withOrgAuth(
  async ({ orgId }, request) => handleReorder(db.clientWeeklyMeeting as unknown as OrderableDelegate, orgId, request),
  { fallbackErrorMessage: "Failed to reorder weekly meeting" },
);
