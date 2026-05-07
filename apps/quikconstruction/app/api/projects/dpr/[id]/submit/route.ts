import { NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext } from "@/lib/auth/context";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit a DPR for approval.
 *
 * Status transitions:
 *   draft ──submit──> submitted   (DPR row, regardless of skip outcome)
 *   instance ──────> pending_approval  (always — last step is human)
 *
 * DPR is the one entity where the last step never auto-approves on
 * submit: even if the raiser fills every step's role, the prefix is
 * recorded as auto-skipped history but the instance stays
 * pending_approval on the last step. Encoded by passing
 * `autoApprovedInstanceStatus: "pending_approval"` to the helper.
 *
 * BOQ progress posting does NOT happen here — that runs only when the
 * final step is approved, in /approve.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const dpr = await (db as any).cnDailyProgressReport.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { id: true, status: true, dprNumber: true },
  });
  if (!dpr || dpr.status === "inactive") {
    return NextResponse.json({ error: "DPR not found" }, { status: 404 });
  }
  const currentStatus = String(dpr.status ?? "draft").toLowerCase();
  if (currentStatus !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit DPR in status: ${dpr.status}` },
      { status: 400 },
    );
  }

  let instanceId: string;
  let autoApproved: boolean;
  try {
    ({ instanceId, autoApproved } = await submitForApproval({
      ctx: {
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
        userId: ctx.userId,
        roleKey: ctx.roleKey,
      },
      entityType: "dpr",
      entityId: dpr.id,
      entityNumber: dpr.dprNumber ?? dpr.id,
      autoApprovedInstanceStatus: "pending_approval",
    }));
  } catch (err) {
    if (err instanceof NoActiveWorkflowError) {
      return NextResponse.json(
        {
          error:
            "No active DPR workflow is configured. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const updated = await (db as any).cnDailyProgressReport.update({
    where: { id: dpr.id },
    data: {
      status: "submitted",
      approvalId: instanceId,
      updatedBy: ctx.userId,
    },
  });

  return NextResponse.json({
    ...updated,
    approvalInstanceId: instanceId,
    autoApproved,
  });
}
