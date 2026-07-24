/**
 * GET /api/integrations/github/install/callback
 *   ?installation_id=...&setup_action=install&state=...
 *
 * GitHub's App "Setup URL" — hit after the user installs the QuikTrack GitHub
 * App onto an org/account. Verifies the signed state (org binding), reads the
 * installation metadata, and upserts a QtGithubInstallation with an encrypted
 * installation token. Then redirects back to the settings page.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyOAuthState } from "@/lib/services/github/oauth-state";
import { getInstallation } from "@/lib/services/github/client";
import { recordInstallation } from "@/lib/services/github/installation-service";
import { settingsGithubUrl } from "@/lib/services/github/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const installationId = url.searchParams.get("installation_id") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const setupAction = url.searchParams.get("setup_action") ?? "";

  const claims = await verifyOAuthState(state);
  if (!claims || !installationId) {
    return NextResponse.redirect(settingsGithubUrl("?connect=invalid_state"));
  }

  // `request` is the setup_action when a user asks to change plan/repos without
  // a completed install; nothing to record in that case.
  if (setupAction && setupAction !== "install" && setupAction !== "update") {
    return NextResponse.redirect(settingsGithubUrl("?connect=cancelled"));
  }

  try {
    const info = await getInstallation(installationId);
    await recordInstallation({
      orgId: claims.orgId,
      installationId,
      githubAccountLogin: info.accountLogin,
      githubAccountId: info.accountId,
      targetType: info.targetType,
      repoSelection:
        info.repositorySelection === "all" ? "ALL" : "SELECTED",
      createdBy: claims.userId,
    });
  } catch {
    return NextResponse.redirect(settingsGithubUrl("?connect=install_failed"));
  }

  return NextResponse.redirect(settingsGithubUrl("?connect=success"));
}
