/**
 * GET /api/email/mailbox/callback?provider=...&code=...&state=...
 *
 * OAuth redirect target. Identity comes ONLY from the HMAC-verified `state`
 * (userId + orgId), never from the query string or an ambient session — the
 * provider redirect is a top-level navigation and we must not trust it. We
 * exchange the code, fetch the mailbox's own address, encrypt + persist the
 * tokens, then redirect back to Settings → Email.
 *
 * We deliberately do NOT gate this on requireApiUser: NextAuth's SameSite=Lax
 * cookie is present on this top-level GET, but the authoritative identity is
 * the signed state. We additionally require the session (when present) to match
 * the state's userId to defend against a stolen state being replayed by another
 * logged-in user.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProvider, isProviderName } from "@/lib/services/email/providers";
import { verifyState, OAuthStateError } from "@/lib/services/email/oauth-state";
import { saveConnection } from "@/lib/services/email/mailbox";
import { callbackUri, settingsEmailUrl } from "@/lib/services/email/redirect-uri";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  // Provider comes from the signed state (below), NOT the query string — the
  // redirect_uri registered with Azure has no query params (AADSTS50011). We
  // still read any `?provider=` for backward compatibility: older in-flight
  // consent links included it, and if present it must agree with the state.
  const queryProvider = url.searchParams.get("provider");
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  try {
    if (oauthError) {
      return NextResponse.redirect(settingsEmailUrl(`?error=${encodeURIComponent(oauthError)}`));
    }
    if (!code || !stateRaw) {
      return NextResponse.redirect(settingsEmailUrl("?error=invalid_callback"));
    }

    const state = verifyState(stateRaw);
    const provider = state.provider;
    if (!isProviderName(provider)) {
      return NextResponse.redirect(settingsEmailUrl("?error=invalid_callback"));
    }
    // If a legacy `?provider=` was supplied, it must match the signed state.
    if (queryProvider && queryProvider !== provider) {
      return NextResponse.redirect(settingsEmailUrl("?error=provider_mismatch"));
    }

    // Defense-in-depth: if a session is present, it must be the same user.
    const session = await getServerSession(authOptions);
    if (session?.user?.id && session.user.id !== state.userId) {
      return NextResponse.redirect(settingsEmailUrl("?error=session_mismatch"));
    }

    const prov = getProvider(provider);
    const tokens = await prov.exchangeCode({ code, redirectUri: callbackUri() });
    if (!tokens.refreshToken) {
      // Without a refresh token we cannot sustain background sync.
      return NextResponse.redirect(settingsEmailUrl("?error=no_refresh_token"));
    }
    const emailAddress = await prov.getProfileEmail(tokens.accessToken);

    await saveConnection({
      orgId: state.orgId,
      userId: state.userId,
      provider,
      emailAddress,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      scope: tokens.scope,
    });

    return NextResponse.redirect(settingsEmailUrl("?connected=1"));
  } catch (err) {
    if (err instanceof OAuthStateError) {
      return NextResponse.redirect(settingsEmailUrl("?error=invalid_state"));
    }
    const message = err instanceof Error ? err.message : "connect_failed";
    console.error("[email:callback]", message);
    return NextResponse.redirect(settingsEmailUrl("?error=connect_failed"));
  }
}
