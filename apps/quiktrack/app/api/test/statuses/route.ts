import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { serverError } from "@/lib/test/gate";

/**
 * GET /api/test/statuses — the org's status catalogue.
 *
 * Org-scoped, not project-scoped, so no project gate: any authenticated member
 * of the org may read the vocabulary. The catalogue is what the runner's status
 * picker and every count/donut render from.
 */
export const GET = withOrgAuth(async ({ orgId }) => {
  try {
    const statuses = await db.qtTestStatus.findMany({
      where: { orgId, isDeleted: false },
      select: {
        id: true,
        key: true,
        label: true,
        color: true,
        isFinal: true,
        isDefault: true,
        isAutomation: true,
        orderNo: true,
      },
      orderBy: { orderNo: "asc" },
    });
    return NextResponse.json({ success: true, data: statuses });
  } catch (error: unknown) {
    return serverError(error);
  }
});
