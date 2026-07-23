import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Category");

const updateSchema = z.object({ name: z.string() });

export const PUT = auth.update<{ id: string }>(async ({ orgId }, req, { params }) => {
  const { id } = params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const row = await db.astBaseCategory.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const cat = await db.astBaseCategory.update({ where: { id }, data: { name: parsed.data.name } });
  return NextResponse.json({ success: true, data: cat });
});

export const DELETE = auth.delete<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const { id } = params;
  const row = await db.astBaseCategory.findFirst({ where: { id, orgId }, select: { id: true, name: true } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  // Block deletion while real assets reference this base category — otherwise the
  // FK restrict throws a raw 500. Empty sub-categories still cascade-delete.
  const assetCount = await db.astAsset.count({ where: { orgId, baseCategoryId: id } });
  if (assetCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Can't delete "${row.name}" — ${assetCount} asset${assetCount === 1 ? "" : "s"} still use${assetCount === 1 ? "s" : ""} this base category. Reassign or remove them first.`,
      },
      { status: 409 },
    );
  }

  await db.astBaseCategory.delete({ where: { id } });
  return NextResponse.json({ success: true, data: { ok: true } });
});
