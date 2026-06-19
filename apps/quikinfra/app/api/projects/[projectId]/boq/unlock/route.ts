import { NextResponse } from "next/server";
import { boqService, BOQError } from "@/lib/boq";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTenantContext } from "@/lib/auth/context";

/**
 * Unlock BOQ — Super Admin override per spec §11.4
 * POST /api/projects/:projectId/boq/unlock
 *
 * v2 permission gate: `construction.boq` + `lock` — same authority as
 * locking. There's no separate `unlock` action because anyone who can
 * lock a BOQ also needs to be able to unlock it (otherwise BOQs get
 * stranded).
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
      const state = await boqService.unlockBOQ(ctx, params.projectId);
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
