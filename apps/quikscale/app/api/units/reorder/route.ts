import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { handleReorder } from "@/lib/api/handleReorder";
import type { OrderableDelegate } from "@/lib/api/reorderRow";

const auth = withOrgAuthForResource("orgSetup.units", "Unit");

// POST /api/units/reorder — move a unit to a new manual position (org-shared).
export const POST = auth.update(
  async ({ orgId }, request) =>
    handleReorder(db.unitMaster as unknown as OrderableDelegate, orgId, request),
  { fallbackErrorMessage: "Failed to reorder unit" },
);
