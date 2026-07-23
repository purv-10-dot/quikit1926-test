import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { handleReorder } from "@/lib/api/handleReorder";
import type { OrderableDelegate } from "@/lib/api/reorderRow";

const auth = withOrgAuthForResource("priority", "Priority");

// POST /api/priority/reorder — move a Priority row to a new manual position.
export const POST = auth.update(
  async ({ orgId }, request) => handleReorder(db.priority as unknown as OrderableDelegate, orgId, request),
  { fallbackErrorMessage: "Failed to reorder priority" },
);
