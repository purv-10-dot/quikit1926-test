import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getFullLeadRecord } from "@/lib/services/leads/full-record";
import { isUserVisibleLeadActivity } from "@/lib/services/leads/log-lead-system-activities";

export const runtime = "nodejs";

/**
 * GET /api/leads/:id/full
 *
 * Single-payload aggregator for the lead detail page.
 * Returns lead + activities + tasks + notes + opportunities + callLogs + attachments
 * in one round-trip. Field-masked + ACL-scoped.
 *
 * Parity: legacy GET /leads/:id/full.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "view");

    const record = await getFullLeadRecord({ user, leadId: id });
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Hide the internal lead-creation init events from the UI timeline. The
    // snapshot/insights/analytics inside `record` were already computed from the
    // full set, so reporting/intelligence are unaffected.
    return NextResponse.json({
      ...record,
      activities: record.activities.filter(isUserVisibleLeadActivity),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
