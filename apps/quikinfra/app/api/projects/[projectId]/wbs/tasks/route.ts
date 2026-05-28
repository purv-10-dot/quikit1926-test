import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/context";
import { createWbsTask, listWbsTasks, WbsError } from "@/lib/wbs/wbs-repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const ctxOrResponse = await requirePermission("wbs.read");
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const data = await listWbsTasks(ctx, params.projectId);
    return NextResponse.json({ data });
  } catch (err: any) {
    if (err instanceof WbsError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.httpStatus });
    }
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const ctxOrResponse = await requirePermission("wbs.write", {
    matrix: { menuKey: "pm.wbs", action: "add" },
  });
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const body = (await req.json().catch(() => ({}))) as any;
    // Strip NUL bytes — Postgres rejects them in text columns with 0x00
    // "invalid byte sequence" errors, and they sneak in from Excel pastes.
    const clean = (s: unknown): string =>
      typeof s === "string" ? s.split(String.fromCharCode(0)).join("") : "";
    const required = (k: string, label: string) => {
      const v = clean(body?.[k]).trim();
      if (!v) throw new WbsError("VALIDATION", `${label} is required`, 400);
      return v;
    };

    const parentIdRaw = clean(body.parentId);
    const created = await createWbsTask(ctx, params.projectId, {
      parentId: parentIdRaw ? parentIdRaw : null,
      wbsCode: required("wbsCode", "WBS code"),
      name: required("name", "Task name"),
      startDate: required("startDate", "Start date"),
      endDate: required("endDate", "End date"),
      status: typeof body.status === "string" ? (clean(body.status) as any) : undefined,
      progress: typeof body.progress === "number" ? body.progress : Number(body.progress ?? 0),
      predecessors: Array.isArray(body.predecessors)
        ? body.predecessors
            .filter((x: any) => typeof x === "string")
            .map((x: string) => clean(x))
        : [],
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    if (err instanceof WbsError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.httpStatus });
    }
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}

