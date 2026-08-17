import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { serverError } from "@/lib/test/gate";

/**
 * GET /api/test/templates — the org's case templates.
 *
 * `kind` is what the case editor keys off: TEXT shows a single Expected Result,
 * STEPS shows the per-step grid, BDD shows Given/When/Then, EXPLORATORY shows a
 * charter with no formal expectations. Both storage shapes exist on every case,
 * so switching template changes the form, never the stored content.
 *
 * Org-scoped like /api/test/statuses, so no project gate: any member may read
 * the vocabulary.
 */
export const GET = withOrgAuth(async ({ orgId }) => {
  try {
    const templates = await db.qtTestTemplate.findMany({
      where: { orgId, isDeleted: false },
      select: { id: true, name: true, kind: true, isDefault: true, projectId: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ success: true, data: templates });
  } catch (error: unknown) {
    return serverError(error);
  }
});
