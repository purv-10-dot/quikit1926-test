import { NextRequest, NextResponse } from "next/server";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTenantContext } from "@/lib/auth/context";
import { deleteWbsTask, updateWbsTask, WbsError } from "@/lib/wbs/wbs-repository";

const auth = withOrgAuthForResource("construction.wbs");

function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof WbsError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.httpStatus },
    );
  }
  const message = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export const PATCH = auth.edit<{ projectId: string; id: string }>(
  async (_authCtx, req: NextRequest, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const updated = await updateWbsTask(ctx, params.projectId, params.id, {
        parentId: body.parentId as never,
        wbsCode: body.wbsCode as never,
        name: body.name as never,
        startDate: body.startDate as never,
        endDate: body.endDate as never,
        status: body.status as never,
        progress: body.progress as never,
        predecessors: body.predecessors as never,
      });
      return NextResponse.json(updated);
    } catch (err) {
      return toErrorResponse(err);
    }
  },
);

export const DELETE = auth.delete<{ projectId: string; id: string }>(
  async (_authCtx, _req, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      await deleteWbsTask(ctx, params.projectId, params.id);
      return NextResponse.json({ success: true });
    } catch (err) {
      return toErrorResponse(err);
    }
  },
);
