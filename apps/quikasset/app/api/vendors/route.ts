import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Vendor");

/** Shared vendor body. Blank strings coerce to null; email (when present) must be valid. */
export const vendorSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required"),
  contactPerson: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().email("Enter a valid email").nullable().optional(),
  ),
  address: z.string().trim().nullable().optional(),
  status: z.enum(["Active", "Inactive"]).default("Active"),
});

const statusFilter = z.enum(["Active", "Inactive"]).optional();

/** GET /api/vendors — org's vendors (optional ?status=Active for the repair picker). */
export const GET = auth.view(async ({ orgId }, req) => {
  const parsed = statusFilter.safeParse(new URL(req.url).searchParams.get("status") ?? undefined);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid status filter" }, { status: 400 });
  }
  const vendors = await db.astVendor.findMany({
    where: { orgId, ...(parsed.data ? { status: parsed.data } : {}) },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ success: true, data: vendors });
});

/** POST /api/vendors — create a vendor. Gated on Vendor:create. */
export const POST = auth.create(async ({ orgId, userId, userEmail }, req) => {
  const parsed = vendorSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { name, contactPerson, phone, email, address, status } = parsed.data;
  const vendor = await db.astVendor.create({
    data: {
      orgId,
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
    action: "Vendor Created",
    entityId: vendor.id,
    entityName: vendor.name,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: vendor }, { status: 201 });
});
