import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const schema = z.object({
  // Vendor is optional at send-to-repair time (AstVendor FK); the admin can also
  // set it later on the created repair, matching the direct Repair flow.
  vendorId: z.string().nullable().optional(),
  estimatedCost: z.coerce.number().nullable().optional(),
  sentDate: z.string().min(1, "Sent date is required"),
  expectedReturn: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * "Send to repair" — fulfil an approved repair request. Gated on
 * `RepairRequest:approve`. Only `Approved` requests can be sent. This is the
 * bridge into the existing admin Repair flow: it creates a real `AstRepair`
 * (status InRepair) from the request's asset + issue text, flips the asset to
 * InRepair, links the request to the created repair, and marks it `Fulfilled` —
 * exactly mirroring `POST /api/repairs`, so the repair then behaves like any
 * admin-logged repair in Repair & Recovery.
 */
export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId, userEmail }, req, { params }) => {
    const { id } = params;
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const { vendorId, estimatedCost, sentDate, expectedReturn, notes } = parsed.data;

    const request = await db.astRepairRequest.findFirst({ where: { id, orgId } });
    if (!request) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    if (request.status !== "Approved") {
      return NextResponse.json(
        { success: false, error: `Only approved requests can be sent to repair (status is ${request.status})` },
        { status: 409 },
      );
    }

    // The asset must still exist in this org and be repairable — an asset that's
    // already InRepair or Retired can't be sent again (avoids a conflicting
    // second repair record for the same unit).
    const asset = await db.astAsset.findFirst({
      where: { id: request.assetId, orgId },
      select: { id: true, assetStatus: true, itemName: true },
    });
    if (!asset) return NextResponse.json({ success: false, error: "Asset not found" }, { status: 404 });
    if (asset.assetStatus === "InRepair" || asset.assetStatus === "Retired") {
      return NextResponse.json(
        { success: false, error: `Asset is ${asset.assetStatus} and cannot be sent to repair` },
        { status: 409 },
      );
    }

    // Guard the vendor FK against cross-org linking (same as POST /api/repairs).
    if (vendorId) {
      const vendorOwned = await db.astVendor.findFirst({ where: { id: vendorId, orgId }, select: { id: true } });
      if (!vendorOwned) return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });
    }

    const { repair, updated } = await db.$transaction(async (tx) => {
      const repair = await tx.astRepair.create({
        data: {
          orgId,
          assetId: request.assetId,
          issueTitle: request.issueTitle,
          issueDescription: request.issueDescription,
          vendorId: vendorId || null,
          estimatedCost: estimatedCost ?? null,
          sentDate,
          expectedReturn: expectedReturn || null,
          notes: notes || null,
          status: "InRepair",
        },
      });
      await tx.astAsset.update({ where: { id: request.assetId }, data: { assetStatus: "InRepair" } });
      const updated = await tx.astRepairRequest.update({
        where: { id },
        data: { status: "Fulfilled", repairId: repair.id },
      });
      return { repair, updated };
    });

    await audit({
      orgId,
      module: "RepairRequests",
      action: "Repair Request Sent to Repair",
      entityId: id,
      entityName: `${request.issueTitle} → ${asset.itemName}`,
      details: `Repair ${repair.id}`,
      actorId: userId,
      actorEmail: userEmail,
    });

    return NextResponse.json({ success: true, data: updated }, { status: 201 });
  },
  { permission: { resource: "RepairRequest", action: "approve" } },
);
