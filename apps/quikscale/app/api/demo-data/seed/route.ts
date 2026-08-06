import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { seedDemoDataForOrg } from "@/lib/services/demoData";
import { toErrorMessage } from "@/lib/api/errors";

/**
 * POST /api/demo-data/seed — idempotently seeds org-specific demo data.
 * Admin-only; the dashboard fires this once on an admin's first load. A
 * no-op if already seeded or previously cleared (see DemoDataState).
 */
export async function POST() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId } = auth;

    const result = await seedDemoDataForOrg(orgId, userId);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: toErrorMessage(error, "Failed to seed demo data") },
      { status: 500 },
    );
  }
}
