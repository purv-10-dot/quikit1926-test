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
 * Approve / reject a repair request. Gated on `RepairRequest:approve` (a
 * grantable capability — admin holds it via backfill, but any custom "approver"
 * role can too). Approve applies only to `Submitted`; reject applies to
 * `Submitted` OR `Approved` — so an approver can back out an approval before it
 * has been sent to repair (nothing is created until "send to repair", so no
 * cleanup is needed). Rejection requires a reason.
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

    const request = await db.astRepairRequest.findFirst({
      where: { id, orgId },
      select: { id: true, status: true, issueTitle: true },
    });
    if (!request) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    // Approve: only a Submitted request. Reject: a Submitted OR an already
    // Approved one (back out before send-to-repair) — but not one already
    // Fulfilled, which holds a live AstRepair record.
    const allowed =
      action === "approve"
        ? request.status === "Submitted"
        : request.status === "Submitted" || request.status === "Approved";
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: `Cannot ${action} a request in status ${request.status}` },
        { status: 409 },
      );
    }
    if (action === "reject" && !note?.trim()) {
      return NextResponse.json({ success: false, error: "A reason is required to reject." }, { status: 400 });
    }

    const updated = await db.astRepairRequest.update({
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
      module: "RepairRequests",
      action: action === "approve" ? "Repair Request Approved" : "Repair Request Rejected",
      entityId: id,
      entityName: request.issueTitle,
      details: note?.trim() || undefined,
      actorId: userId,
      actorEmail: userEmail,
    });

    return NextResponse.json({ success: true, data: updated });
  },
  { permission: { resource: "RepairRequest", action: "approve" } },
);
