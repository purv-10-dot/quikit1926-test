import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  findMaterialIssueById,
  patchMaterialIssueStatus,
} from "@/lib/store/material-issue-repository";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit Material Issue for approval.
 *
 * Both the MI record and the approval instance live in Postgres now;
 * the MI row is updated via the material-issue repository's
 * `patchMaterialIssueStatus` helper after the workflow walk completes.
 * `entityType="material_issues"` is the join key (matches the option
 * exposed in Settings → Workflows).
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const issue = await findMaterialIssueById(ctx.tenantId, params.id);
  if (!issue) {
    return NextResponse.json(
      { error: "Material Issue not found" },
      { status: 404 },
    );
  }
  const currentStatus = String(issue.status ?? "draft").toLowerCase();
  if (currentStatus !== "draft") {
    return NextResponse.json(
      { error: `Cannot submit material issue in status: ${issue.status}` },
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
      entityType: "material_issues",
      entityId: issue.id,
      entityNumber: issue.issueNumber ?? issue.id,
    }));
  } catch (err) {
    if (err instanceof NoActiveWorkflowError) {
      return NextResponse.json(
        {
          error:
            "No active Material Issue workflow is configured. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const now = new Date();
  const updated = await patchMaterialIssueStatus(ctx.tenantId, issue.id, {
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
