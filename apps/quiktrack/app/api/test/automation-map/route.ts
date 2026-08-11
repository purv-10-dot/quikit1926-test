import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { badRequest, gateProjectResolved, serverError } from "@/lib/test/gate";

/**
 * GET /api/test/automation-map?projectId=&ids=a,b,c
 *
 * Lets a CI job verify its mapping BEFORE a run — cheaper than discovering after
 * the fact that half the suite reported into nothing. Returns matched ids with
 * their case, and the unmatched remainder.
 *
 * With no `ids`, returns every case that has an automationId, so a pipeline can
 * diff its own test inventory against the repository.
 */

export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    const url = new URL(req.url);
    // May be a cuid or a projectKey. CI callers naturally use the readable key.
    const idOrKey = url.searchParams.get("projectId");
    if (!idOrKey) return badRequest("projectId is required");

    const { denied, projectId } = await gateProjectResolved(
      orgId,
      userId,
      idOrKey,
      "TestCase",
      "view",
    );
    if (denied) return denied;

    const idsParam = url.searchParams.get("ids");
    const requested = idsParam
      ? idsParam
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : null;

    if (requested && requested.length > 5_000) {
      return badRequest("Too many ids — send at most 5000 per request.");
    }

    const cases = await db.qtTestCase.findMany({
      where: {
        orgId,
        projectId,
        isDeleted: false,
        automationId: requested ? { in: requested } : { not: null },
      },
      select: {
        id: true,
        refId: true,
        title: true,
        automationId: true,
        approvalState: true,
      },
      orderBy: { refId: "asc" },
    });

    const matchedIds = new Set(
      cases.map((c) => c.automationId).filter((v): v is string => v !== null),
    );

    return NextResponse.json({
      success: true,
      data: {
        matched: cases,
        unmatched: requested
          ? Array.from(new Set(requested)).filter((id) => !matchedIds.has(id))
          : [],
        totalMapped: cases.length,
      },
    });
  } catch (error: unknown) {
    return serverError(error);
  }
});
