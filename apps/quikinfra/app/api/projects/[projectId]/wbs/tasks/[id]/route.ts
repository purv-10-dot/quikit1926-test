import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/context";
import { deleteWbsTask, updateWbsTask, WbsError } from "@/lib/wbs/wbs-repository";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; id: string } },
) {
  const ctxOrResponse = await requirePermission("wbs.write", {
    matrix: { menuKey: "pm.wbs", action: "edit" },
  });
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const updated = await updateWbsTask(ctx, params.projectId, params.id, {
      parentId: body.parentId,
      wbsCode: body.wbsCode,
      name: body.name,
      startDate: body.startDate,
      endDate: body.endDate,
      status: body.status,
      progress: body.progress,
      predecessors: body.predecessors,
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    if (err instanceof WbsError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.httpStatus });
    }
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { projectId: string; id: string } },
) {
  const ctxOrResponse = await requirePermission("wbs.write", {
    matrix: { menuKey: "pm.wbs", action: "delete" },
  });
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    await deleteWbsTask(ctx, params.projectId, params.id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof WbsError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.httpStatus });
    }
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}

