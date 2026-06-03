import { NextRequest, NextResponse } from "next/server";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTenantContext } from "@/lib/auth/context";
import { createWbsTask, listWbsTasks, WbsError } from "@/lib/wbs/wbs-repository";

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

export const GET = auth.view<{ projectId: string }>(
  async (_authCtx, _req, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const data = await listWbsTasks(ctx, params.projectId);
      return NextResponse.json({ data });
    } catch (err) {
      return toErrorResponse(err);
    }
  },
);

export const POST = auth.create<{ projectId: string }>(
  async (_authCtx, req: NextRequest, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      // Strip NUL bytes — Postgres rejects them in text columns with
      // "invalid byte sequence" errors, and they sneak in via Excel pastes.
      const clean = (s: unknown): string =>
        typeof s === "string" ? s.split(String.fromCharCode(0)).join("") : "";
      const required = (k: string, label: string): string => {
        const v = clean(body[k]).trim();
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
        status:
          typeof body.status === "string"
            ? (clean(body.status) as never)
            : undefined,
        progress:
          typeof body.progress === "number"
            ? body.progress
            : Number(body.progress ?? 0),
        predecessors: Array.isArray(body.predecessors)
          ? body.predecessors
              .filter((x: unknown) => typeof x === "string")
              .map((x: string) => clean(x))
          : [],
      });
      return NextResponse.json(created, { status: 201 });
    } catch (err) {
      return toErrorResponse(err);
    }
  },
);
