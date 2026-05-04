import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { internalReturnCreateSchema } from "@/lib/schemas/procurement-3b";

const withOrgAuth = withOrgAuthForModule("store");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const returns = await db.cnInternalReturn.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    include: {
      issue: { select: { id: true, issueNumber: true } },
      project: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: { returnDate: "desc" },
  });
  return NextResponse.json({ success: true, data: returns });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = internalReturnCreateSchema.parse(body);
  const issue = await db.cnMaterialIssue.findFirst({
    where: { id: input.issueId, orgId, deletedAt: null },
    select: { id: true, status: true, projectId: true, locationId: true },
  });
  if (!issue) return NextResponse.json({ success: false, error: "Issue not found" }, { status: 400 });
  if (issue.status !== "posted") {
    return NextResponse.json({ success: false, error: "Can only return from a posted issue" }, { status: 400 });
  }
  if (issue.projectId !== input.projectId || issue.locationId !== input.locationId) {
    return NextResponse.json({ success: false, error: "Project/Location must match source issue" }, { status: 400 });
  }
  const dup = await db.cnInternalReturn.findFirst({ where: { orgId, returnNumber: input.returnNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Return number '${input.returnNumber}' already exists` }, { status: 409 });

  const ret = await db.cnInternalReturn.create({
    data: {
      orgId,
      returnNumber: input.returnNumber,
      issueId: input.issueId,
      projectId: input.projectId,
      locationId: input.locationId,
      returnDate: new Date(input.returnDate),
      returnedBy: input.returnedBy,
      reason: input.reason,
      status: "draft",
      createdBy: userId,
      lines: {
        create: input.lines.map((l) => ({
          itemId: l.itemId,
          returnQty: l.returnQty,
          uomId: l.uomId,
          unitRate: l.unitRate,
          amount: l.returnQty * l.unitRate,
          remarks: l.remarks,
        })),
      },
    },
    include: { lines: true },
  });
  return NextResponse.json({ success: true, data: ret }, { status: 201 });
});
