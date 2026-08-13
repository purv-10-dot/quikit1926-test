import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { validateTemplate } from "@/lib/templates/validate";

/**
 * POST /api/templates/autotest — automated wiring check across ALL templates.
 * For each: validate the graph (no side effects) and set/clear the Tested flag.
 * Returns a per-template pass/fail summary so the gallery can report results.
 * Admin-only.
 */
export const POST = withOrgAuth(
  async () => {
    const templates = await db.wfTemplate.findMany({ orderBy: { name: "asc" } });

    const results = [];
    for (const tpl of templates) {
      const r = validateTemplate(tpl.graphNodes, tpl.graphEdges);
      await db.wfTemplate.update({
        where: { id: tpl.id },
        data: { isTested: r.passed, lastTestedAt: r.passed ? new Date() : null },
      });
      results.push({
        id: tpl.id,
        name: tpl.name,
        passed: r.passed,
        // Only the failing checks matter for the report.
        failures: r.checks.filter((c) => !c.ok).map((c) => c.detail ?? c.label),
      });
    }

    const passed = results.filter((r) => r.passed).length;
    return NextResponse.json({
      success: true,
      data: { total: results.length, passed, failed: results.length - passed, results },
    });
  },
  { requireAdmin: true },
);
