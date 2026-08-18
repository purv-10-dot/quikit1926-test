import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getProvider } from "@/lib/data/registry";
import { MASTER_TABLES, type MasterTable } from "@/lib/data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/data/master/[table] — org-scoped master pick-list (doc §6.2 · C7):
 * users · teams · categories · units · quarters. Feeds the builder's people /
 * reference pickers with live org data. QuikScale is the master-data owner.
 */
export const GET = withOrgAuth<{ table: string }>(async ({ orgId }, _req, { params }) => {
  if (!(MASTER_TABLES as readonly string[]).includes(params.table)) {
    return NextResponse.json(
      { success: false, error: `Unknown master table "${params.table}"` },
      { status: 400 },
    );
  }
  const provider = getProvider("quikscale");
  if (!provider) {
    return NextResponse.json({ success: false, error: "No data provider" }, { status: 500 });
  }
  const data = await provider.listMaster(orgId, params.table as MasterTable);
  return NextResponse.json({ success: true, data });
});
