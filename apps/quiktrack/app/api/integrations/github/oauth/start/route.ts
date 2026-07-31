/**
 * GET /api/integrations/github/oauth/start
 *
 * Begins the GitHub connect flow for the caller's org. Admin-only — connecting
 * a GitHub org is an org-level integration action. Signs a short-lived state
 * carrying the verified userId+orgId (never trusted from the browser on
 * callback) and 302-redirects to GitHub's OAuth authorize screen.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { signOAuthState } from "@/lib/services/github/oauth-state";
import { isGithubAppConfigured, oauthAuthorizeUrl } from "@/lib/services/github/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId } = auth as { orgId: string; userId: string };

    if (!isGithubAppConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "GitHub integration is not configured on this server.",
        },
        { status: 503 },
      );
    }

    const state = await signOAuthState({
      userId,
      orgId,
      nonce: randomBytes(16).toString("hex"),
    });

    return NextResponse.redirect(oauthAuthorizeUrl(state));
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to start GitHub connect";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
