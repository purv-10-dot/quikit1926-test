import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { handleReorder } from "@/lib/api/handleReorder";
import type { OrderableDelegate } from "@/lib/api/reorderRow";

const auth = withOrgAuthForResource("www", "WWW");

// POST /api/www/reorder — move a WWW row to a new manual position.
export const POST = auth.update(
  async ({ orgId }, request) => handleReorder(db.wWWItem as unknown as OrderableDelegate, orgId, request),
  { fallbackErrorMessage: "Failed to reorder WWW item" },
);
