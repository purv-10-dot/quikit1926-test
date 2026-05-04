import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { companyUpdateSchema } from "@/lib/schemas/masters";

const withOrgAuth = withOrgAuthForModule("masters");

// GET /api/masters/companies/[id]
export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const company = await db.cnCompany.findFirst({
    where: { id: params.id, orgId },
  });
  if (!company) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: company });
});

// PATCH /api/masters/companies/[id]
export const PATCH = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const existing = await db.cnCompany.findFirst({
    where: { id: params.id, orgId },
    select: { id: true, deletedAt: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const body = await req.json();
  const input = companyUpdateSchema.parse(body);
  const updated = await db.cnCompany.update({
    where: { id: params.id },
    data: { ...input, updatedBy: userId },
  });
  return NextResponse.json({ success: true, data: updated });
});

// DELETE /api/masters/companies/[id] — soft delete
export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.cnCompany.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  await db.cnCompany.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), updatedBy: userId },
  });
  return NextResponse.json({ success: true });
});
