import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";

const data: any[] = [];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.toLowerCase() ?? "";

  const ctx = await getTenantContext();

  let filtered: any[] = data;

  // Per-user project scoping — applied BEFORE the optional ?projectId
  // query filter so a user can never use the query string to see a project
  // they're not assigned to.
  if (ctx?.projectIds !== undefined) {
    const allowed = new Set(ctx.projectIds);
    filtered = filtered.filter((row: any) => allowed.has(row.projectId));
  }

  if (search) filtered = filtered.filter(r => r.incidentNo.toLowerCase().includes(search) || r.description.toLowerCase().includes(search) || r.type.toLowerCase().includes(search));
  return NextResponse.json({ data: filtered, total: filtered.length });
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "safety.incidents", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for safety.incidents`, 403);
  }
  const body = await req.json();
  const record = { id: `inc-${data.length + 1}`, incidentNo: `INC-2026-${String(data.length + 1).padStart(3, "0")}`, ...body };
  data.push(record);
  return NextResponse.json(record, { status: 201 });
}
