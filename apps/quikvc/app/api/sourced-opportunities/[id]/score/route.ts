/**
 * Compute thesis-fit AI score for a sourced opportunity.
 *
 *   POST /api/sourced-opportunities/[id]/score
 *
 * Calls Claude (Haiku) with the fund's enabled verticals + the startup pitch.
 * Persists thesisFitScore + thesisFitReason + auto-suggested verticalId.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { scoreThesisFit } from "@/lib/ai/prompts/thesis-fit";
import { getVCRole, denyIfNotInRoles, ANALYST_ROLES } from "@/lib/rbac";

export const POST = withTenantAuth(
  async ({ orgId, userId }, _req: NextRequest, { params }: { params: { id: string } }) => {
    const denied = denyIfNotInRoles(await getVCRole(userId, orgId), ANALYST_ROLES);
    if (denied) return denied;

    const opp = await db.vCSourcedOpportunity.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, startupName: true, pitch: true, website: true, verticalId: true },
    });
    if (!opp) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const verticals = await db.vCVertical.findMany({
      where: { orgId, enabled: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, description: true },
    });

    const result = await scoreThesisFit({
      startupName: opp.startupName,
      pitch: opp.pitch ?? "",
      website: opp.website,
      verticals,
    });

    // Persist — keep existing verticalId if AI returned null or already set.
    const verticalId = opp.verticalId ?? result.verticalId ?? null;
    await db.vCSourcedOpportunity.update({
      where: { id: opp.id },
      data: {
        thesisFitScore: result.score,
        thesisFitReason: result.reason,
        verticalId,
        updatedBy: userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        score: result.score,
        reason: result.reason,
        verticalId,
        isStub: result.isStub,
      },
    });
  },
);
