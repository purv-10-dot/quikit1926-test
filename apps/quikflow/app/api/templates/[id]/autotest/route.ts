import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { validateTemplate } from "@/lib/templates/validate";

type Params = { id: string };

/**
 * POST /api/templates/:id/autotest — automated end-to-end wiring check for one
 * template. Validates the graph (trigger + all-actions-implemented + valid
 * edges) with no side effects; marks it Tested when it passes, clears the flag
 * when it fails. Admin-only (the badge is a global claim).
 */
export const POST = withOrgAuth<Params>(
  async (_ctx, _req, { params }) => {
    const tpl = await db.wfTemplate.findUnique({ where: { id: params.id } });
    if (!tpl) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    const result = validateTemplate(tpl.graphNodes, tpl.graphEdges);
    await db.wfTemplate.update({
      where: { id: tpl.id },
      data: { isTested: result.passed, lastTestedAt: result.passed ? new Date() : null },
    });

    return NextResponse.json({
      success: true,
      data: { id: tpl.id, name: tpl.name, passed: result.passed, checks: result.checks },
    });
  },
  { requireAdmin: true },
);
