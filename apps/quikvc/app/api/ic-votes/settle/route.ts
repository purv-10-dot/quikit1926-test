/**
 * POST /api/ic-votes/settle
 *
 * Body: { memoId }
 *
 * Closes IC voting on a frozen memo. Reads the tenant's VCFundProfile to
 * determine voting mode + threshold:
 *   - single: a single approve / reject / conditional-approve decides
 *   - multi:  needs quorum + threshold (simple-majority / two-thirds / unanimous)
 *
 * If approved → advance deal stage to "due-diligence". If rejected → mark
 * deal closed-lost. If conditional → advance with conditions noted.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { notifyRole } from "@/lib/notifications";
import { PARTNER_ROLES, requireRoleOrAudit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const bodySchema = z.object({ memoId: z.string().min(1) });

export const POST = withTenantAuth(async ({ orgId, userId }, req: NextRequest) => {
  const denied = await requireRoleOrAudit(userId, orgId, PARTNER_ROLES, {
    action: "ic.settle",
    req,
  });
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Missing memoId" }, { status: 400 });
  }

  const memo = await db.vCICMemo.findFirst({
    where: { id: parsed.data.memoId, orgId },
    include: {
      votes: { select: { decision: true, voterId: true } },
      deal: { select: { id: true, currentStage: true } },
    },
  });
  if (!memo) return NextResponse.json({ success: false, error: "Memo not found" }, { status: 404 });

  const fundProfile = await db.vCFundProfile.findUnique({
    where: { orgId },
    select: { icVotingMode: true, icQuorum: true, icThreshold: true },
  });
  const mode = fundProfile?.icVotingMode ?? "single";
  const quorum = fundProfile?.icQuorum ?? 2;
  const threshold = fundProfile?.icThreshold ?? "simple-majority";

  // Filter out abstains for tally
  const tallyVotes = memo.votes.filter((v) => v.decision !== "abstain");
  const approves = tallyVotes.filter((v) => v.decision === "approve" || v.decision === "conditional-approve").length;
  const rejects = tallyVotes.filter((v) => v.decision === "reject").length;
  const conditional = tallyVotes.filter((v) => v.decision === "conditional-approve").length;
  const total = tallyVotes.length;

  // Determine outcome
  let outcome: "approved" | "rejected" | "conditional" | "pending" = "pending";
  let reason = "";

  if (mode === "single") {
    if (total === 0) {
      return NextResponse.json(
        { success: false, error: "No votes cast yet" },
        { status: 409 },
      );
    }
    // Single mode: take the first non-abstain vote as authoritative
    const v = tallyVotes[0].decision;
    outcome =
      v === "approve" ? "approved" : v === "reject" ? "rejected" : "conditional";
    reason = `Single-approver mode: ${v}`;
  } else {
    // Multi-vote: check quorum first
    if (memo.votes.length < quorum) {
      return NextResponse.json(
        {
          success: false,
          error: `Quorum not met (${memo.votes.length}/${quorum} votes — abstains count toward quorum but not toward outcome)`,
        },
        { status: 409 },
      );
    }
    // Apply threshold
    const approveRatio = approves / Math.max(total, 1);
    const required =
      threshold === "unanimous" ? 1 : threshold === "two-thirds" ? 2 / 3 : 0.5 + 1e-9;

    if (approveRatio >= required) {
      // Conditional-approve dominates if any voter conditioned
      outcome = conditional > 0 ? "conditional" : "approved";
      reason = `Multi-vote ${threshold}: ${approves}/${total} (${Math.round(approveRatio * 100)}%)`;
    } else {
      outcome = "rejected";
      reason = `Multi-vote ${threshold} failed: ${approves}/${total} (${Math.round(approveRatio * 100)}%)`;
    }
  }

  // Apply outcome to deal
  const newStage =
    outcome === "approved" || outcome === "conditional" ? "due-diligence" : memo.deal.currentStage;
  const closedStatus = outcome === "rejected" ? "closed-lost" : "open";

  await db.$transaction([
    db.vCDeal.update({
      where: { id: memo.deal.id },
      data: {
        ...(newStage !== memo.deal.currentStage ? { currentStage: newStage, daysInStage: 0 } : {}),
        ...(closedStatus !== "open" ? { closedStatus } : {}),
        updatedBy: userId,
      },
    }),
    db.vCTimelineEvent.create({
      data: {
        orgId,
        dealId: memo.deal.id,
        type: "ic-decision",
        actorId: userId,
        summary: `IC decision: ${outcome.toUpperCase()} — ${reason}`,
        payload: { outcome, mode, threshold, approves, rejects, total },
        visibility: "founder",
      },
    }),
  ]);

  // Audit success
  await audit({
    orgId,
    userId,
    action: "ic.settle",
    resource: memo.deal.id,
    metadata: { outcome, mode, threshold, approves, rejects, total, newStage, closedStatus },
    req,
  });

  // Notify partners + analysts of the outcome
  await Promise.all([
    notifyRole(orgId, "partner", {
      type: "vote-settled",
      title: `IC settled: ${outcome.toUpperCase()}`,
      body: reason,
      href: `/deals/${memo.deal.id}/ic`,
    }),
    notifyRole(orgId, "analyst", {
      type: "vote-settled",
      title: `IC settled: ${outcome.toUpperCase()}`,
      body: reason,
      href: `/deals/${memo.deal.id}`,
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: { outcome, mode, threshold, approves, rejects, total, newStage, closedStatus },
  });
});
