import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { handleReorder } from "@/lib/api/handleReorder";
import type { OrderableDelegate } from "@/lib/api/reorderRow";

const auth = withOrgAuthForResource("clientMeetings.clients", "ClientMaster");

// POST /api/client-meetings/clients/reorder — move a Client row to a new position.
export const POST = auth.update(
  async ({ orgId }, request) => handleReorder(db.client as unknown as OrderableDelegate, orgId, request),
  { fallbackErrorMessage: "Failed to reorder client" },
);
