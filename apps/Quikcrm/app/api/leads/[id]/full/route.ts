import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getFullLeadRecord } from "@/lib/services/leads/full-record";

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
    return NextResponse.json(record);
  } catch (e) {
    return errorResponse(e);
  }
}
