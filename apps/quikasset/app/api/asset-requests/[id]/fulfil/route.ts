import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const schema = z.object({
  // Physical: the in-stock asset to hand over. Ignored for subscriptions.
  assetId: z.string().optional(),
  // AstEmployee to assign to; defaults to the requester's linked employee.
  employeeId: z.string().optional(),
  // Subscription: free-text reference for the out-of-band grant (Option A).
  note: z.string().nullable().optional(),
});

/**
 * Fulfil an approved request. Gated on `AssetRequest:approve`.
 *
 * - Physical: fulfils ONE unit — assigns a chosen Available asset to the
 *   requester's employee (creating an AstAssignment linked back via requestId),
 *   marks the asset Assigned, and bumps quantityFulfilled. The request flips to
 *   Fulfilled once the counter reaches quantity, else PartiallyFulfilled.
 * - Subscription: no assignment (a seat is provisioned out of band) — the request
 *   is marked Fulfilled with a fulfilmentNote.
 *
 * "Not in stock" is out of scope this pass: fulfilling with a non-Available asset
 * is rejected (409) rather than queued.
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
    const { assetId, employeeId, note } = parsed.data;

    const request = await db.astAssetRequest.findFirst({ where: { id, orgId } });
    if (!request) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    if (request.status !== "Approved" && request.status !== "PartiallyFulfilled") {
      return NextResponse.json(
        { success: false, error: `Only approved requests can be fulfilled (status is ${request.status})` },
        { status: 409 },
      );
    }

    // ── Subscription: status-only fulfilment, no assignment ──
    if (request.itemKind === "Subscription") {
      const updated = await db.astAssetRequest.update({
        where: { id },
        data: {
          status: "Fulfilled",
          quantityFulfilled: request.quantity,
          fulfilmentNote: note?.trim() || request.fulfilmentNote,
        },
      });
      await audit({
        orgId,
        module: "AssetRequests",
        action: "Request Fulfilled (subscription)",
        entityId: id,
        entityName: request.itemType,
        details: note?.trim() || undefined,
        actorId: userId,
        actorEmail: userEmail,
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // ── Physical: fulfil one unit from stock ──
    if (request.quantityFulfilled >= request.quantity) {
      return NextResponse.json({ success: false, error: "Request is already fully fulfilled" }, { status: 409 });
    }
    if (!assetId) {
      return NextResponse.json(
        { success: false, error: "assetId is required to fulfil a physical request" },
        { status: 400 },
      );
    }

    // Who receives it: an explicit employee, else the requester's linked employee.
    const employee = employeeId
      ? await db.astEmployee.findFirst({ where: { id: employeeId, orgId }, select: { id: true } })
      : await db.astEmployee.findFirst({
          where: { orgId, userId: request.requesterUserId },
          select: { id: true },
        });
    if (!employee) {
      return NextResponse.json(
        {
          success: false,
          error: "No employee to assign to — the requester has no linked employee record; pass employeeId.",
        },
        { status: 422 },
      );
    }

    const asset = await db.astAsset.findFirst({
      where: { id: assetId, orgId },
      select: { id: true, assetStatus: true, itemName: true },
    });
    if (!asset) return NextResponse.json({ success: false, error: "Asset not found" }, { status: 404 });
    if (asset.assetStatus !== "Available") {
      return NextResponse.json(
        { success: false, error: `Asset is not Available (status ${asset.assetStatus}) — not-in-stock handling is manual for now` },
        { status: 409 },
      );
    }

    const nextFulfilled = request.quantityFulfilled + 1;
    const nextStatus = nextFulfilled >= request.quantity ? "Fulfilled" : "PartiallyFulfilled";

    const updated = await db.$transaction(async (tx) => {
      await tx.astAssignment.create({
        data: {
          orgId,
          assetId: asset.id,
          userId: employee.id,
          condition: "Good",
          status: "Active",
          requestId: id,
        },
      });
      await tx.astAsset.update({ where: { id: asset.id }, data: { assetStatus: "Assigned" } });
      return tx.astAssetRequest.update({
        where: { id },
        data: { quantityFulfilled: nextFulfilled, status: nextStatus },
      });
    });

    await audit({
      orgId,
      module: "AssetRequests",
      action: nextStatus === "Fulfilled" ? "Request Fulfilled" : "Request Partially Fulfilled",
      entityId: id,
      entityName: `${request.itemType} → ${asset.itemName}`,
      details: `Unit ${nextFulfilled}/${request.quantity}`,
      actorId: userId,
      actorEmail: userEmail,
    });

    return NextResponse.json({ success: true, data: updated });
  },
  { permission: { resource: "AssetRequest", action: "approve" } },
);
