/**
 * GET /api/integrations/github/install/callback
 *   ?installation_id=...&setup_action=install[&state=...]
 *
 * GitHub's App "Setup URL" — hit after the user installs the QuikTrack GitHub
 * App onto an org/account, and also directly from GitHub's own "manage
 * installation" page.
 *
 * IMPORTANT: GitHub does NOT reliably preserve our `state` query param through
 * the App installation redirect (it strips params and appends its own). So we
 * resolve the org/user from the authenticated QuikTrack SESSION first — the
 * user never logged out of QuikTrack, and the session cookie rides along on
 * this same-site redirect. We fall back to a signed `state` only if a session
 * isn't present (e.g. the flow was completed in a different browser context).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { verifyOAuthState } from "@/lib/services/github/oauth-state";
import { getInstallation } from "@/lib/services/github/client";
import { recordInstallation } from "@/lib/services/github/installation-service";
import { settingsGithubUrl } from "@/lib/services/github/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveIdentity(
  state: string,
): Promise<{ userId: string; orgId: string } | null> {
  // Prefer the live session (survives GitHub's param-stripping redirect).
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const orgId = await getOrgId(session.user.id);
    if (orgId) return { userId: session.user.id, orgId };
  }
  // Fallback: the signed state, if GitHub happened to preserve it.
  const claims = await verifyOAuthState(state);
  if (claims) return { userId: claims.userId, orgId: claims.orgId };
  return null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const installationId = url.searchParams.get("installation_id") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const setupAction = url.searchParams.get("setup_action") ?? "";

  const identity = await resolveIdentity(state);
  if (!identity || !installationId) {
    return NextResponse.redirect(settingsGithubUrl("?connect=invalid_state"));
  }
  const claims = identity;

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
  } catch (error: unknown) {
    // Surface the real reason in the server log — the redirect can only carry a
    // generic code. Most failures here are a bad App JWT (malformed private key)
    // or a 404 from GitHub rejecting it.
    console.error(
      "[github install callback] failed for installation",
      installationId,
      "-",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.redirect(settingsGithubUrl("?connect=install_failed"));
  }

  return NextResponse.redirect(settingsGithubUrl("?connect=success"));
}
