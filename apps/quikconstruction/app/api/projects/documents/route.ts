import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";

const data: any[] = [];

export async function GET(req: NextRequest) {
  try {
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

    if (search) filtered = filtered.filter(r => r.documentName.toLowerCase().includes(search) || r.category.toLowerCase().includes(search));
    return NextResponse.json({ data: filtered, total: filtered.length });

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[projects/documents.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const record = { id: `doc-${data.length + 1}`, uploadDate: new Date().toISOString().split("T")[0], ...body };
  data.push(record);
  return NextResponse.json(record, { status: 201 });
}
