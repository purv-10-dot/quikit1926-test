import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { vendorUpdateSchema } from "@/lib/schemas/masters";

const withOrgAuth = withOrgAuthForModule("masters");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const vendor = await db.cnVendor.findFirst({
    where: { id: params.id, orgId },
  });
  if (!vendor) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: vendor });
});

export const PATCH = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const existing = await db.cnVendor.findFirst({
    where: { id: params.id, orgId },
    select: { id: true, code: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const body = await req.json();
  const input = vendorUpdateSchema.parse(body);
  if (input.code && input.code !== existing.code) {
    const conflict = await db.cnVendor.findFirst({
      where: { orgId, code: input.code, deletedAt: null, NOT: { id: params.id } },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json(
        { success: false, error: `Vendor code '${input.code}' already exists` },
        { status: 409 },
      );
    }
  }
  const updated = await db.cnVendor.update({
    where: { id: params.id },
    data: { ...input, updatedBy: userId },
  });
  return NextResponse.json({ success: true, data: updated });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.cnVendor.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  await db.cnVendor.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), updatedBy: userId },
  });
  return NextResponse.json({ success: true });
});
