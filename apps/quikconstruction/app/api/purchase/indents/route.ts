import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { indentCreateSchema } from "@/lib/schemas/procurement-3b";

const withOrgAuth = withOrgAuthForModule("purchase");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const list = await db.cnPurchaseIndent.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    include: { project: { select: { id: true, name: true } }, lines: { include: { item: true, uom: true } } },
    orderBy: { requestDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = indentCreateSchema.parse(body);
  const project = await db.cnProject.findFirst({ where: { id: input.projectId, orgId }, select: { id: true } });
  if (!project) return NextResponse.json({ success: false, error: "Project not found" }, { status: 400 });
  const dup = await db.cnPurchaseIndent.findFirst({
    where: { orgId, indentNumber: input.indentNumber, deletedAt: null },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ success: false, error: `Indent number '${input.indentNumber}' already exists` }, { status: 409 });

  const indent = await db.cnPurchaseIndent.create({
    data: {
      orgId,
      indentNumber: input.indentNumber,
      prId: input.prId ?? null,
      projectId: input.projectId,
      requestedById: input.requestedById,
      requestDate: new Date(input.requestDate),
      requiredDate: input.requiredDate ? new Date(input.requiredDate) : null,
      purpose: input.purpose,
      status: "draft",
      createdBy: userId,
      lines: {
        create: input.lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          uomId: l.uomId,
          estimatedRate: l.estimatedRate,
          remarks: l.remarks,
        })),
      },
    },
    include: { lines: true },
  });
  return NextResponse.json({ success: true, data: indent }, { status: 201 });
});
