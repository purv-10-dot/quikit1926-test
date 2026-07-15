import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().nullable().optional(),
});

/**
 * Approve / reject a request. Gated on `AssetRequest:approve` (a grantable
 * capability — admin holds it via backfill, but any custom "approver" role can
 * too). Only `Submitted` / `PendingApproval` requests are actionable; rejection
 * requires a reason.
 */
export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId, userEmail }, req, { params }) => {
    const { id } = params;
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const { action, note } = parsed.data;

    const request = await db.astAssetRequest.findFirst({
      where: { id, orgId },
      select: { id: true, status: true, itemType: true },
    });
    if (!request) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    if (request.status !== "Submitted" && request.status !== "PendingApproval") {
      return NextResponse.json(
        { success: false, error: `Cannot ${action} a request in status ${request.status}` },
        { status: 409 },
      );
    }
    if (action === "reject" && !note?.trim()) {
      return NextResponse.json({ success: false, error: "A reason is required to reject." }, { status: 400 });
    }

    const updated = await db.astAssetRequest.update({
      where: { id },
      data: {
        status: action === "approve" ? "Approved" : "Rejected",
        reviewedByUserId: userId,
        reviewedAt: new Date(),
        decisionNote: note?.trim() || null,
      },
    });

    await audit({
      orgId,
      module: "AssetRequests",
      action: action === "approve" ? "Request Approved" : "Request Rejected",
      entityId: id,
      entityName: request.itemType,
      details: note?.trim() || undefined,
      actorId: userId,
      actorEmail: userEmail,
    });

    return NextResponse.json({ success: true, data: updated });
  },
  { permission: { resource: "AssetRequest", action: "approve" } },
);
