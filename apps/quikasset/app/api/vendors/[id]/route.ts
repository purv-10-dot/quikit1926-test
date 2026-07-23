import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { vendorSchema } from "../route";

const auth = withOrgAuthForResource("Vendor");

/** PUT /api/vendors/[id] — update a vendor. Gated on Vendor:update. */
export const PUT = auth.update<{ id: string }>(async ({ orgId, userId, userEmail }, req, { params }) => {
  const { id } = params;
  const parsed = vendorSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const row = await db.astVendor.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const { name, contactPerson, phone, email, address, status } = parsed.data;
  const vendor = await db.astVendor.update({
    where: { id },
    data: {
      name,
      contactPerson: contactPerson ?? null,
      phone: phone ?? null,
      email: email ?? null,
      address: address ?? null,
      status,
    },
  });

  await audit({
    orgId,
    module: "Vendors",
    action: "Vendor Updated",
    entityId: vendor.id,
    entityName: vendor.name,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: vendor });
});

/**
 * DELETE /api/vendors/[id] — remove a vendor. Gated on Vendor:delete.
 * The AstRepair.vendorId FK is ON DELETE SET NULL, so any linked repairs keep
 * their record and simply fall back to their legacy `vendor` text (or "—").
 */
export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId, userEmail }, _req, { params }) => {
  const { id } = params;
  const row = await db.astVendor.findFirst({ where: { id, orgId }, select: { id: true, name: true } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await db.astVendor.delete({ where: { id } });

  await audit({
    orgId,
    module: "Vendors",
    action: "Vendor Removed",
    entityId: id,
    entityName: row.name,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: { ok: true } });
});
