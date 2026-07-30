import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { handleReorder } from "@/lib/api/handleReorder";
import type { OrderableDelegate } from "@/lib/api/reorderRow";

const withOrgAuth = withOrgAuthForModule("clientMeetings.members");

// POST /api/client-meetings/members/reorder — move a ClientMember row.
export const POST = withOrgAuth(
  async ({ orgId }, request) => handleReorder(db.clientMember as unknown as OrderableDelegate, orgId, request),
  { fallbackErrorMessage: "Failed to reorder member" },
);
