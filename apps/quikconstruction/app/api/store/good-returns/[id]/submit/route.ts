import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  findGoodReturnById,
  patchGoodReturnStatus,
} from "@/lib/store/good-return-repository";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit Good Return for approval.
 *
 * Both the Good Return row and the approval instance live in Postgres
 * now; the GR row is updated via the good-return repository after the
 * workflow walk completes. `entityType="good_return"` is the join key
 * (matches the option exposed in Settings → Workflows).
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const gr = await findGoodReturnById(ctx.tenantId, params.id);
  if (!gr) {
    return NextResponse.json(
      { error: "Good Return not found" },
      { status: 404 },
    );
  }
  const currentStatus = String(gr.status ?? "draft").toLowerCase();
  if (currentStatus !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit good return in status: ${gr.status}` },
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
      entityType: "good_return",
      entityId: gr.id,
      entityNumber: gr.returnNumber ?? gr.id,
    }));
  } catch (err) {
    if (err instanceof NoActiveWorkflowError) {
      return NextResponse.json(
        {
          error:
            "No active Good Return workflow is configured. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const now = new Date();
  const updated = await patchGoodReturnStatus(ctx.tenantId, gr.id, {
    status: autoApproved ? "approved" : "pending_approval",
    approvalId: instanceId,
    submittedAt: now,
    submittedBy: ctx.userId,
    ...(autoApproved ? { approvedAt: now, approvedBy: ctx.userId } : {}),
    updatedBy: ctx.userId,
  });

  return NextResponse.json({
    ...updated,
    approvalInstanceId: instanceId,
    autoApproved,
  });
}
