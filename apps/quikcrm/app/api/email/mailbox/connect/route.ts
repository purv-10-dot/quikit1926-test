/**
 * GET /api/email/mailbox/connect?provider=gmail|microsoft
 *
 * Starts the mailbox OAuth flow for the CURRENT user. Signs a state carrying
 * the verified userId+orgId (never trusted from the browser on callback) and
 * 302-redirects to the provider consent screen.
 *
 * Personal action — any authenticated user may connect THEIR OWN mailbox.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getProvider, isProviderName, isProviderConfigured } from "@/lib/services/email/providers";
import { signState } from "@/lib/services/email/oauth-state";
import { callbackUri } from "@/lib/services/email/redirect-uri";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const provider = new URL(req.url).searchParams.get("provider") ?? "";
    if (!isProviderName(provider)) {
      return NextResponse.json(
        { success: false, error: "Unknown provider. Use gmail or microsoft." },
        { status: 400 },
      );
    }
    if (!isProviderConfigured(provider)) {
      return NextResponse.json(
        { success: false, error: `${provider} mailbox integration is not configured on this server.` },
        { status: 503 },
      );
    }

    // Optional tenant-wide admin-consent flow. Normal per-user connects DO NOT
    // force a consent screen (Microsoft only prompts when consent is actually
    // missing). Use ?admin_consent=1 only when new scopes need re-approval —
    // restricted to Administrators since it grants consent for the whole tenant.
    const adminConsent = new URL(req.url).searchParams.get("admin_consent") === "1";
    if (adminConsent && user.role !== "Administrator") {
      return NextResponse.json(
        { success: false, error: "Admin consent may only be initiated by an Administrator." },
        { status: 403 },
      );
    }

    const state = signState({
      userId: user.userId,
      orgId: user.orgId,
      provider,
      nonce: randomBytes(16).toString("hex"),
    });

    const authUrl = getProvider(provider).getAuthUrl({
      redirectUri: callbackUri(),
      state,
      adminConsent,
    });
    return NextResponse.redirect(authUrl);
  } catch (e) {
    return errorResponse(e);
  }
}
