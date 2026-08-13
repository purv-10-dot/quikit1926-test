import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getProvider } from "@/lib/data/registry";
import { moduleByKey } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/data/[module]/records?search=&limit= — org-scoped record list for a
 * module (doc §6.1 · C4 query). Powers record pickers and condition previews.
 * Modules with no backing table return `{ items: [], readable: false }`.
 */
export const GET = withOrgAuth<{ module: string }>(async ({ orgId }, req, { params }) => {
  if (!moduleByKey(params.module)) {
    return NextResponse.json({ success: false, error: "Unknown module" }, { status: 404 });
  }
  const provider = getProvider("quikscale");
  if (!provider) {
    return NextResponse.json({ success: false, error: "No data provider" }, { status: 500 });
  }

  const search = req.nextUrl.searchParams.get("search")?.trim() || undefined;
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

  const data = await provider.queryRecords(orgId, { moduleKey: params.module, search, limit });
  return NextResponse.json({ success: true, data });
});
