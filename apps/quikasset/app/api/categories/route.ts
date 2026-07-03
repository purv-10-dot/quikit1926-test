import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Category");

const createSchema = z.object({
  name: z.string(),
  baseCategoryId: z.string(),
});

export const GET = auth.view(async ({ orgId }, req) => {
  const baseCategoryId = new URL(req.url).searchParams.get("baseCategoryId") ?? undefined;
  const cats = await db.astCategory.findMany({
    where: { orgId, ...(baseCategoryId ? { baseCategoryId } : {}) },
    orderBy: { name: "asc" },
    include: { baseCategory: true, _count: { select: { assets: true } } },
  });
  return NextResponse.json({ success: true, data: cats });
});

export const POST = auth.create(async ({ orgId }, req) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { name, baseCategoryId } = parsed.data;

  // ensure parent base category belongs to this org
  const baseOwned = await db.astBaseCategory.findFirst({ where: { id: baseCategoryId, orgId }, select: { id: true } });
  if (!baseOwned) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const cat = await db.astCategory.create({
    data: { orgId, name, baseCategoryId },
    include: { baseCategory: true },
  });
  return NextResponse.json({ success: true, data: cat }, { status: 201 });
});
