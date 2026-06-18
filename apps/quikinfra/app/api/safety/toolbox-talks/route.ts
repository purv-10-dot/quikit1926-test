import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";

interface ToolboxTalkRecord {
  id: string;
  topic: string;
  conductedBy: string;
  projectId: string;
  [key: string]: unknown;
}

const data: ToolboxTalkRecord[] = [];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.toLowerCase() ?? "";

  const ctx = await getTenantContext();

  let filtered: ToolboxTalkRecord[] = data;

  // Per-user project scoping — applied BEFORE the optional ?projectId
  // query filter so a user can never use the query string to see a project
  // they're not assigned to.
  if (ctx?.projectIds !== undefined) {
    const allowed = new Set(ctx.projectIds);
    filtered = filtered.filter((row) => allowed.has(row.projectId));
  }

  if (search) filtered = filtered.filter(r => r.topic.toLowerCase().includes(search) || r.conductedBy.toLowerCase().includes(search));
  return NextResponse.json({ data: filtered, total: filtered.length });
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "safety.toolbox", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for safety.toolbox`, 403);
  }
  const body = await req.json();
  const record = { id: `tbt-${data.length + 1}`, ...body };
  data.push(record);
  return NextResponse.json(record, { status: 201 });
}
