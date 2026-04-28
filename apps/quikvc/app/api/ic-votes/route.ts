/**
 * POST /api/ic-votes — cast (or recast) a vote on a frozen IC memo.
 *
 * Body: { memoId, decision, rationale?, conditions? }
 *
 * Tenant's icVotingMode determines what happens after a vote lands:
 *   - "single": first decision wins, deal advances/rejects immediately.
 *   - "multi":  votes accumulate until quorum reached, then settle on
 *              majority outcome (server-side; see /api/ic-votes/settle).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { getVCRole, denyIfNotInRoles, IC_VOTING_ROLES } from "@/lib/rbac";

const bodySchema = z.object({
  memoId: z.string().min(1),
  decision: z.enum(["approve", "conditional-approve", "reject", "abstain"]),
  rationale: z.string().max(2000).optional(),
  conditions: z.string().max(2000).optional(),
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req: NextRequest) => {
  const denied = denyIfNotInRoles(await getVCRole(userId, tenantId), IC_VOTING_ROLES);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { memoId, decision, rationale, conditions } = parsed.data;

  const memo = await db.vCICMemo.findFirst({
    where: { id: memoId, tenantId },
    select: { id: true, dealId: true, status: true },
  });
  if (!memo) {
    return NextResponse.json({ success: false, error: "Memo not found" }, { status: 404 });
  }
  if (memo.status !== "frozen") {
    return NextResponse.json(
      { success: false, error: "Memo must be frozen before IC voting" },
      { status: 409 },
    );
  }

  // Upsert vote (one per voter per memo; recast updates)
  await db.vCICVote.upsert({
    where: { memoId_voterId: { memoId, voterId: userId } },
    update: { decision, rationale: rationale ?? null, conditions: conditions ?? null },
    create: { tenantId, memoId, voterId: userId, decision, rationale: rationale ?? null, conditions: conditions ?? null },
  });

  await db.vCTimelineEvent.create({
    data: {
      tenantId,
      dealId: memo.dealId,
      type: "ic-vote-cast",
      actorId: userId,
      summary: `IC vote cast: ${decision}`,
      payload: { decision, conditions: conditions ?? null },
      visibility: "internal",
    },
  });

  return NextResponse.json({ success: true, data: { memoId, decision } }, { status: 201 });
});
