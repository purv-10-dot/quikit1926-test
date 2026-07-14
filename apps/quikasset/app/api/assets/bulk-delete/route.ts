import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { writableAssetIds } from "@/lib/api/assetScope";

const auth = withOrgAuthForResource("Asset");

const schema = z.object({ ids: z.array(z.string()) });

export const POST = auth.delete(async ({ orgId, userId, userEmail }, req) => {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  // Row scope: non-viewAll callers may only delete assets assigned to them —
  // silently drop any out-of-scope ids rather than deleting them.
  const allowed = await writableAssetIds(orgId, userId, userEmail, parsed.data.ids);
  const { count } = await db.astAsset.deleteMany({
    where: { orgId, id: { in: allowed } },
  });
  return NextResponse.json({ success: true, data: { deleted: count } });
});
