import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { miCreateSchema } from "@/lib/schemas/procurement";

const withTenantAuth = withTenantAuthForModule("store");

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const issues = await db.cnMaterialIssue.findMany({
    where: {
      tenantId,
      deletedAt: includeDeleted ? { not: null } : null,
      ...(status ? { status } : {}),
    },
    include: {
      project: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: { issueDate: "desc" },
  });
  return NextResponse.json({ success: true, data: issues });
});

/**
 * POST /api/store/material-issue — create MI as DRAFT.
 * No stock effect until POST /material-issue/[id]/post.
 */
export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const body = await req.json();
  const input = miCreateSchema.parse(body);

  const [project, location] = await Promise.all([
    db.cnProject.findFirst({ where: { id: input.projectId, tenantId }, select: { id: true } }),
    db.cnLocation.findFirst({ where: { id: input.locationId, tenantId }, select: { id: true } }),
  ]);
  if (!project) return NextResponse.json({ success: false, error: "Project not found" }, { status: 400 });
  if (!location) return NextResponse.json({ success: false, error: "Location not found" }, { status: 400 });

  const dup = await db.cnMaterialIssue.findFirst({
    where: { tenantId, issueNumber: input.issueNumber, deletedAt: null },
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
      tenantId,
      issueNumber: input.issueNumber,
      projectId: input.projectId,
      locationId: input.locationId,
      issuedToId: input.issuedToId,
      issuedById: input.issuedById,
      issueDate: new Date(input.issueDate),
      purpose: input.purpose,
      status: "draft",
      createdBy: userId,
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
});
