import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { gateModuleApi } from "@quikit/auth/feature-gate";

/**
 * GET /api/opsp/review/logs?opspId=xxx&horizon=quarter&rowIndex=0
 *
 * Returns audit log entries for a specific OPSP review row.
 * Used by the "Logs" icon column in the OPSP Review table.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { tenantId } = auth;
    const blocked = await gateModuleApi("quikscale", "opsp.review", tenantId);
    if (blocked) return blocked;

    const { searchParams } = req.nextUrl;
    const opspId = searchParams.get("opspId");
    if (!opspId) {
      return NextResponse.json(
        { success: false, error: "opspId is required" },
        { status: 400 },
      );
    }

    const horizon = searchParams.get("horizon") ?? "";
    const rowIndex = searchParams.get("rowIndex") ?? "";

    // Build a search filter for audit logs matching this review context
    const logs = await db.auditLog.findMany({
      where: {
        tenantId,
        entityType: "Review",
        entityId: opspId,
        // Filter by horizon+rowIndex in the changes array or reason field
        ...(horizon && rowIndex
          ? { reason: { contains: `${horizon}` } }
          : {}),
      },
      select: {
        id: true,
        actorId: true,
        action: true,
        changes: true,
        reason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load review logs";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
