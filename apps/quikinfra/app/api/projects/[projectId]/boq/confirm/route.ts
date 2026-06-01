import { NextRequest, NextResponse } from "next/server";
import { boqService, BOQError } from "@/lib/boq";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTenantContext, badRequest } from "@/lib/auth/context";

/**
 * BOQ Confirm — per spec §8.2
 * POST /api/projects/:projectId/boq/confirm
 * Body: { batchId: string }
 *
 * v2 permission gate: `construction.boq` + `import`.
 */
const auth = withOrgAuthForResource("construction.boq");

export const POST = auth.importOrEdit<{ projectId: string }>(
  async (_authCtx, req: NextRequest, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const body = await req.json();
      if (!body.batchId) {
        return badRequest("batchId is required");
      }
      const result = await boqService.confirmImport(ctx, params.projectId, body.batchId);
      return NextResponse.json(result);
    } catch (err: unknown) {
      if (err instanceof BOQError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: err.httpStatus },
        );
      }
      const message = err instanceof Error ? err.message : "Internal error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  },
);
