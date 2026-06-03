import { NextResponse } from "next/server";
import { boqService, BOQError } from "@/lib/boq";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTenantContext } from "@/lib/auth/context";

/**
 * Lock BOQ — per spec §11.4
 * POST /api/projects/:projectId/boq/lock
 *
 * v2 permission gate: `construction.boq` + `lock`.
 * Migrated from `requirePermission("boq.lock")` (see legacyKeyMap.ts).
 *
 * The boq service still expects the legacy TenantContext (it reads
 * ctx.userType, ctx.projectIds, ctx.roleKey). We grab it once after the v2
 * gate has passed — it's cheap because getServerSession is request-scoped.
 * When the boq service migrates off legacy ctx we can drop this fetch.
 */
const auth = withOrgAuthForResource("construction.boq");

export const POST = auth.lock<{ projectId: string }>(
  async (_authCtx, _req, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    try {
      const state = await boqService.lockBOQ(ctx, params.projectId);
      return NextResponse.json({ success: true, lockState: state });
    } catch (err: unknown) {
      if (err instanceof BOQError) {
        return NextResponse.json(
          { success: false, error: err.message, code: err.code },
          { status: err.httpStatus },
        );
      }
      const message = err instanceof Error ? err.message : "Operation failed";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
);
