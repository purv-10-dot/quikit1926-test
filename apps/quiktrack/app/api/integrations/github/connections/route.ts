/**
 * GET /api/integrations/github/connections
 *
 * Lists the org's connected GitHub installations for the settings UI. Admin-
 * only. Returns no secrets (accessTokenEnc is never selected by the service).
 * Also reports whether the server is configured, so the UI can show a clear
 * "not configured" state instead of a broken connect button.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { listInstallations } from "@/lib/services/github/installation-service";
import { isGithubAppConfigured } from "@/lib/services/github/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const installations = await listInstallations(orgId);
    return NextResponse.json({
      success: true,
      data: { configured: isGithubAppConfigured(), installations },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to load connections";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
