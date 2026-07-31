/**
 * GET /api/integrations/github/oauth/callback?code=...&state=...
 *
 * Identity leg of the connect flow. Verifies the signed state (CSRF + org
 * binding), exchanges the code for a user access token to confirm the caller
 * actually authorized us, then sends the user on to install the GitHub App
 * (the App installation grants the repo access + webhooks). A fresh signed
 * state is carried to the install step so its callback can re-bind org/user.
 *
 * We do NOT persist the user token here — the org-level installation token
 * (minted after install) is what all data calls use. Confirming the exchange
 * succeeds is enough to prove authorization before we advance the flow.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import {
  signOAuthState,
  verifyOAuthState,
} from "@/lib/services/github/oauth-state";
import { exchangeOAuthCode } from "@/lib/services/github/client";
import {
  appInstallUrl,
  oauthCallbackUri,
  settingsGithubUrl,
} from "@/lib/services/github/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  // A user who declines consent comes back with ?error=access_denied.
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(settingsGithubUrl("?connect=denied"));
  }

  const claims = await verifyOAuthState(state);
  if (!claims || !code) {
    return NextResponse.redirect(settingsGithubUrl("?connect=invalid_state"));
  }

  try {
    // Prove the user authorized us; the token itself is not persisted.
    await exchangeOAuthCode(code, oauthCallbackUri());
  } catch {
    return NextResponse.redirect(settingsGithubUrl("?connect=exchange_failed"));
  }

  // Advance to App installation, carrying a fresh state bound to the same
  // org/user so the install callback can trust it.
  const installState = await signOAuthState({
    userId: claims.userId,
    orgId: claims.orgId,
    nonce: randomBytes(16).toString("hex"),
  });
  const install = new URL(appInstallUrl());
  install.searchParams.set("state", installState);
  return NextResponse.redirect(install.toString());
}
