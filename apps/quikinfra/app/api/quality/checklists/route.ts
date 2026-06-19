import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { parsePagination, paginateDb } from "@/lib/http/pagination";
import {
  listChecklists,
  countChecklists,
  createChecklist,
} from "@/lib/quality/checklists-repository";

/**
 * GET  /api/quality/checklists — list tenant safety/quality checklists.
 * POST /api/quality/checklists — create a checklist.
 */

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";

  const baseOpts = {
    orgId: ctx.orgId,
    search,
    projectIds: ctx.projectIds,
  };
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listChecklists({ ...baseOpts, ...paging }),
    () => countChecklists(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "quality.home", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for quality.home`, 403);
  }

  const body = await req.json();
  const name = body?.name ?? body?.checklistName;
  if (!name) {
    return NextResponse.json({ error: "Checklist name is required" }, { status: 400 });
  }

  const checklistDate = body?.date ? new Date(body.date) : new Date();
  if (Number.isNaN(checklistDate.getTime())) {
    return NextResponse.json({ error: "Invalid checklist date" }, { status: 400 });
  }

  // Accept either a structured `lines` array or a legacy comma-separated
  // `items` string from the original in-memory form.
  const items = Array.isArray(body?.lines)
    ? body.lines
    : typeof body?.items === "string"
      ? body.items.split(",").map((s: string) => ({ item: s.trim() })).filter((i: { item: string }) => i.item)
      : [];

  try {
    const record = await createChecklist({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      completedBy: ctx.userId,
      templateName: String(name),
      projectId: body.projectId ?? null,
      checklistDate,
      items,
      overallStatus: body.status ?? "pass",
      remarks: body.remarks ?? null,
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create checklist";
    console.error("[quality.checklists.create] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
