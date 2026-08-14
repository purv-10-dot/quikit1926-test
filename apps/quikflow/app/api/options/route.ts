import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getProvider } from "@/lib/data/registry";
import { MASTER_TABLES, type MasterTable } from "@/lib/data/types";
import { moduleByKey } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/options?source=<source>&search=&limit=
 *
 * The single value-picker endpoint (Data-Level Design §5.1) — the whole "Rohit
 * shows up" fix. One control loads its options from here for ANY dynamic field:
 *   • master:users | master:teams | master:categories | master:units | master:quarters
 *   • module:<key>  (records of a module, e.g. module:kpi)
 * Always org-scoped. Returns { items:[{id,label,sublabel,meta}], hasMore }.
 */
export const GET = withOrgAuth(async ({ orgId }, req) => {
  const source = req.nextUrl.searchParams.get("source")?.trim() ?? "";
  const search = req.nextUrl.searchParams.get("search")?.trim() || undefined;
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25;

  const provider = getProvider("quikscale");
  if (!provider) {
    return NextResponse.json({ success: false, error: "No data provider" }, { status: 500 });
  }

  // ── master:<table> ────────────────────────────────────────────────────────
  if (source.startsWith("master:")) {
    const table = source.slice("master:".length);
    if (!(MASTER_TABLES as readonly string[]).includes(table)) {
      return NextResponse.json({ success: false, error: `Unknown master source "${source}"` }, { status: 400 });
    }
    const { items } = await provider.listMaster(orgId, table as MasterTable);
    const filtered = search
      ? items.filter((i) => i.label.toLowerCase().includes(search.toLowerCase()))
      : items;
    return NextResponse.json({
      success: true,
      data: { items: filtered.slice(0, limit), hasMore: filtered.length > limit },
    });
  }

  // ── module:<key> (records) ─────────────────────────────────────────────────
  if (source.startsWith("module:")) {
    const moduleKey = source.slice("module:".length);
    if (!moduleByKey(moduleKey)) {
      return NextResponse.json({ success: false, error: `Unknown module source "${source}"` }, { status: 400 });
    }
    const { items, readable } = await provider.queryRecords(orgId, { moduleKey, search, limit });
    return NextResponse.json({
      success: true,
      data: {
        items: items.map((r) => ({ id: r.id, label: r.label, meta: r.fields })),
        hasMore: false,
        readable,
      },
    });
  }

  return NextResponse.json(
    { success: false, error: `Invalid source "${source}" (expected master:* or module:*)` },
    { status: 400 },
  );
});
