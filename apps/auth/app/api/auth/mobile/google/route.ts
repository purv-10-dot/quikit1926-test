/**
 * POST /api/auth/mobile/google
 *
 * Native-mobile counterpart of the web Google OAuth login. The QuikInfra
 * Android app signs the user in with the native Google Sign-In SDK,
 * requesting an ID token audienced to the same web `GOOGLE_CLIENT_ID`
 * `apps/auth` already uses for web login (native Google Sign-In issues
 * tokens audienced to whatever client id was passed to `requestIdToken()`
 * / `setServerClientId()` — not the Android OAuth client id registered
 * against `com.quikinfra.app` + SHA-1, which Google Play Services uses only
 * to verify the calling app's package/signature).
 *
 * We verify that token server-side, resolve identity through the exact
 * same logic web OAuth login uses (`resolveOAuthIdentity` — no
 * auto-provisioning, auto-accepts pending SSO invites), then mint the same
 * short-lived handoff token `/api/post-login` mints for web. The mobile
 * client follows the returned `handoffUrl` with its persisted (QuikInfra)
 * cookie jar, landing on the target app's `/auth-handoff` route — entirely
 * unchanged — which sets the real QuikInfra session cookie.
 *
 * This endpoint never creates a session on the auth host itself; mobile
 * has no use for one. Web login behavior is untouched.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  acceptPendingInvites,
  allowedTargetOrigins,
  googleMobileAudiences,
  mintHandoffToken,
  resolveOAuthIdentity,
  resolveOrgContext,
  verifyGoogleIdToken,
} from "@quikit/auth/mobile";
import { createAuthSession } from "@quikit/auth/session-store";

const BodySchema = z.object({
  idToken: z.string().min(1),
  targetOrigin: z.string().url(),
  to: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const internalSecret = process.env.INTERNAL_SECRET;
    if (!googleClientId || !internalSecret) {
      return NextResponse.json(
        { success: false, error: "Server misconfigured" },
        { status: 500 },
      );
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Body must be JSON" },
        { status: 400 },
      );
    }
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    }
    const { idToken, targetOrigin, to } = parsed.data;

    // Check the redirect target BEFORE verifying the Google token, so this
    // endpoint can't be used to probe token validity against an arbitrary
    // origin.
    const normalizedOrigin = targetOrigin.replace(/\/$/, "");
    if (!allowedTargetOrigins().has(normalizedOrigin)) {
      return NextResponse.json(
        { success: false, error: "Unknown targetOrigin" },
        { status: 400 },
      );
    }

    let identity;
    try {
      identity = await verifyGoogleIdToken(
        idToken,
        googleMobileAudiences(googleClientId),
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Invalid Google ID token";
      return NextResponse.json({ success: false, error: message }, { status: 401 });
    }

    const result = await resolveOAuthIdentity({
      provider: "google",
      email: identity.email,
      oauthFirstName: identity.givenName,
      oauthLastName: identity.familyName,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: "No QuikIT account for this Google identity" },
        { status: 403 },
      );
    }

    // Second acceptance pass. `resolveOAuthIdentity` only clears `sso`
    // invites; web then clears the rest in NextAuth's `jwt` callback, which
    // this endpoint never runs (see acceptPendingInvites' comment). Without
    // this, a user holding a `native` invite — QuikInfra's default — would
    // resolve to a null orgId here and be bounced, despite the same sign-in
    // working on web. Must run BEFORE resolveOrgContext, which only counts
    // `status: "active"` memberships.
    await acceptPendingInvites(result.dbUser.id);

    // Soft-revocable session id, same 30-day lifetime web uses. Carried in
    // the handoff token so the session can be killed server-side later.
    const sessionId = await createAuthSession(result.dbUser.id, 30 * 24 * 60 * 60);
    const orgContext = await resolveOrgContext({ userId: result.dbUser.id });

    const token = await mintHandoffToken(internalSecret, {
      userId: result.dbUser.id,
      orgId: orgContext.orgId,
      isSuperAdmin: result.dbUser.isSuperAdmin,
      membershipRole: orgContext.membershipRole,
      email: orgContext.email,
      firstName: orgContext.firstName,
      lastName: orgContext.lastName,
      name: orgContext.name,
      sessionId,
      to: to ?? "/",
    });

    const handoff = new URL("/auth-handoff", normalizedOrigin);
    handoff.searchParams.set("token", token);

    return NextResponse.json(
      { success: true, data: { handoffUrl: handoff.toString() } },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Native Google login failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
