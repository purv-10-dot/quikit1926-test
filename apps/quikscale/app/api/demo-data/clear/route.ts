import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { clearDemoDataForOrg } from "@/lib/services/demoData";
import { toErrorMessage } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/auditLog";

/**
 * POST /api/demo-data/clear — permanently deletes every isDemoData row for
 * this org across every seeded module. Admin-only, irreversible.
 */
export async function POST() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId } = auth;

    const result = await clearDemoDataForOrg(orgId);

    if (result.cleared) {
      await writeAuditLog({
        orgId,
        actorId: userId,
        entityType: "DemoData",
        entityId: orgId,
        action: "DELETE",
        reason: "Cleared all org demo/sample data",
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: toErrorMessage(error, "Failed to clear demo data") },
      { status: 500 },
    );
  }
}
