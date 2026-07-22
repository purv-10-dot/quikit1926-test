import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { handleReorder } from "@/lib/api/handleReorder";
import type { OrderableDelegate } from "@/lib/api/reorderRow";

const auth = withOrgAuthForResource("opsp.categories", "OPSP.Categories");

// POST /api/categories/reorder — move a category to a new manual position
// (org-shared drag order). Uses the shared fractional-position reorder util.
export const POST = auth.update(
  async ({ orgId }, request) =>
    handleReorder(db.categoryMaster as unknown as OrderableDelegate, orgId, request),
  { fallbackErrorMessage: "Failed to reorder category" },
);
