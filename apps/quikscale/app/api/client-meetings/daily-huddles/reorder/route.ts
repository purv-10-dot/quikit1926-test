import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { handleReorder } from "@/lib/api/handleReorder";
import type { OrderableDelegate } from "@/lib/api/reorderRow";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dailyHuddle");

// POST /api/client-meetings/daily-huddles/reorder — move a ClientDailyHuddle row.
export const POST = withOrgAuth(
  async ({ orgId }, request) => handleReorder(db.clientDailyHuddle as unknown as OrderableDelegate, orgId, request),
  { fallbackErrorMessage: "Failed to reorder daily huddle" },
);
