import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { miCreateSchema } from "@/lib/schemas/procurement";

const withOrgAuth = withOrgAuthForModule("store");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const issues = await db.cnMaterialIssue.findMany({
    where: {
      orgId,
      ...(status ? { status } : includeDeleted ? {} : { status: { not: "cancelled" } }),
    },
    include: {
      project: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: { issueDate: "desc" },
  });
  return NextResponse.json({ success: true, data: issues });
}, { permission: { resource: "construction.issue", action: "view" } });

/**
 * POST /api/store/material-issue — create MI as DRAFT.
 * No stock effect until POST /material-issue/[id]/post.
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = miCreateSchema.parse(body);

  const [project, location] = await Promise.all([
    db.cnProject.findFirst({ where: { id: input.projectId, orgId }, select: { id: true } }),
    db.cnLocation.findFirst({ where: { id: input.locationId, orgId }, select: { id: true } }),
  ]);
  if (!project) return NextResponse.json({ success: false, error: "Project not found" }, { status: 400 });
  if (!location) return NextResponse.json({ success: false, error: "Location not found" }, { status: 400 });

  const dup = await db.cnMaterialIssue.findFirst({
    where: { orgId, issueNumber: input.issueNumber },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json(
      { success: false, error: `Issue number '${input.issueNumber}' already exists` },
      { status: 409 },
    );
  }

  const issue = await db.cnMaterialIssue.create({
    data: {
      orgId,
      issueNumber: input.issueNumber,
      projectId: input.projectId,
      locationId: input.locationId,
      issuedToId: input.issuedToId,
      issuedById: input.issuedById,
      issueDate: new Date(input.issueDate),
      purpose: input.purpose,
      status: "draft",
      createdBy: userId,
      updatedBy: userId,
      lines: {
        create: input.lines.map((l) => ({
          itemId: l.itemId,
          issuedQty: l.issuedQty,
          uomId: l.uomId,
          unitRate: l.unitRate,
          amount: l.issuedQty * l.unitRate,
          remarks: l.remarks,
        })),
      },
    },
    include: { lines: true },
  });

  return NextResponse.json({ success: true, data: issue }, { status: 201 });
}, { permission: { resource: "construction.issue", action: "create" } });
