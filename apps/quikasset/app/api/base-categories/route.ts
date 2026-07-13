import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Category");

const createSchema = z.object({ name: z.string() });

export const GET = auth.view(async ({ orgId }) => {
  const cats = await db.astBaseCategory.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    include: { _count: { select: { categories: true, assets: true } } },
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
  const cat = await db.astBaseCategory.create({ data: { orgId, name: parsed.data.name } });
  return NextResponse.json({ success: true, data: cat }, { status: 201 });
});
