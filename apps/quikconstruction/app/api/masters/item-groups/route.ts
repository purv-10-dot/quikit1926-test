import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { itemGroupCreateSchema } from "@/lib/schemas/masters";

const withOrgAuth = withOrgAuthForModule("masters");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const groups = await db.cnItemGroup.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ success: true, data: groups });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = itemGroupCreateSchema.parse(body);
  // Compute depth from parent chain
  let depth = 0;
  if (input.parentId) {
    const parent = await db.cnItemGroup.findFirst({
      where: { id: input.parentId, orgId },
      select: { depth: true },
    });
    if (!parent) {
      return NextResponse.json({ success: false, error: "Parent group not found" }, { status: 400 });
    }
    depth = parent.depth + 1;
    if (depth > 5) {
      return NextResponse.json({ success: false, error: "Max hierarchy depth (5) exceeded" }, { status: 400 });
    }
  }
  const group = await db.cnItemGroup.create({
    data: { ...input, depth, orgId, createdBy: userId },
  });
  return NextResponse.json({ success: true, data: group }, { status: 201 });
});
