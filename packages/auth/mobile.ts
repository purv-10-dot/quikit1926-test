import { SignJWT } from "jose";
import { OAuth2Client } from "google-auth-library";
import { db } from "@quikit/database";
import { setOAuthPrefill } from "./oauth-prefill-store";

/**
 * Shared building blocks for native-mobile authentication (Google ID-token
 * sign-in) AND the existing web OAuth + cross-domain handoff flow.
 *
 * Every function here is a straight extraction of logic that already ran
 * inline in `createAuthOptions`'s `signIn` callback (index.ts) or
 * `apps/auth/app/api/post-login/route.ts` — same queries, same claim shape,
 * same allow-list. Web callers were refactored to call these instead of
 * their inline copies so there is exactly one implementation; behavior for
 * web is unchanged.
 */

// ─────────────────────────────────────────────────────────────────────────
// Google ID-token verification (native mobile only — web goes through
// NextAuth's own GoogleProvider OAuth handshake, not this function).
// ─────────────────────────────────────────────────────────────────────────

export interface GoogleIdentity {
  email: string;
  givenName: string;
  familyName: string;
  sub: string;
}

/**
 * Verifies a Google ID token minted by the native Android Google Sign-In
 * SDK.
 *
 * `audience` must be the WEB `GOOGLE_CLIENT_ID` — the same one `apps/auth`
 * already uses for web login. Android Google Sign-In issues tokens
 * audienced to whatever client id the app passed to `requestIdToken()` /
 * `setServerClientId()`, which is the web client id. The *Android* OAuth
 * client ids (the ones registered with `com.quikinfra.app` + a SHA-1
 * fingerprint) never appear in the token's `aud` claim — Google Play
 * Services uses those only to verify the calling app's package/signature.
 *
 * A second audience may be supplied to cover a mobile build that was
 * configured against a different client id; `verifyIdToken` accepts an
 * array and matches if ANY entry matches.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  audience: string | string[],
): Promise<GoogleIdentity> {
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new Error("Google ID token missing email claim");
  }
  if (payload.email_verified === false) {
    throw new Error("Google account email is not verified");
  }
  return {
    email: payload.email,
    givenName: payload.given_name ?? "",
    familyName: payload.family_name ?? "",
    sub: payload.sub,
  };
}

/**
 * The audience(s) a native Google ID token may carry: the web
 * `GOOGLE_CLIENT_ID` web login already uses, plus any extra client ids in
 * `GOOGLE_MOBILE_CLIENT_IDS` (comma-separated). The extra list is an escape
 * hatch — under the standard Android setup it stays empty.
 */
export function googleMobileAudiences(webClientId: string): string[] {
  const extra = (process.env.GOOGLE_MOBILE_CLIENT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [webClientId, ...extra];
}

// ─────────────────────────────────────────────────────────────────────────
// Identity resolution — extracted from `signIn` callback's OAuth branch.
// ─────────────────────────────────────────────────────────────────────────

export interface ResolveOAuthIdentityInput {
  provider: "google" | "azure-ad";
  email: string | null | undefined;
  oauthFirstName?: string | null;
  oauthLastName?: string | null;
}

export interface ResolvedOAuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isSuperAdmin: boolean;
}

export type ResolveOAuthIdentityResult =
  | { ok: true; dbUser: ResolvedOAuthUser }
  | { ok: false; reason: "no_email" | "unknown_user" };

/**
 * Resolves an OAuth-authenticated email to an existing QuikIT user (no
 * auto-provisioning — the email must already exist), then auto-accepts any
 * pending SSO invitation for that user (`OrgMember.status="invited"`,
 * `inviteMethod="sso"`), mirroring the native accept-invite endpoint's
 * behavior. Also stashes the provider's given/family name for the
 * post-login profile-confirmation form to pre-fill.
 */
export async function resolveOAuthIdentity(
  input: ResolveOAuthIdentityInput,
): Promise<ResolveOAuthIdentityResult> {
  const email = (input.email ?? "").toLowerCase();
  if (!email) {
    console.warn(
      `[auth.resolveOAuthIdentity] OAuth attempt with no email (${input.provider})`,
    );
    return { ok: false, reason: "no_email" };
  }

  // Case-insensitive so historical rows inserted with mixed-case email
  // still match a lowercased OAuth email.
  const dbUser = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isSuperAdmin: true,
    },
  });
  if (!dbUser) {
    console.warn(
      `[auth.resolveOAuthIdentity] OAuth login rejected — unknown email (${input.provider}):`,
      email,
    );
    return { ok: false, reason: "unknown_user" };
  }

  const pendingInvites = await db.orgMember.findMany({
    where: { userId: dbUser.id, status: "invited", inviteMethod: "sso" },
  });
  for (const inv of pendingInvites) {
    await db.orgMember.update({
      where: { id: inv.id },
      data: { status: "active", acceptedAt: new Date(), invitationToken: null },
    });
    if (inv.inviteAppIds && inv.inviteAppIds.length > 0) {
      const userAppRole = inv.role === "app_admin" ? "admin" : "member";
      await db.userAppAccess.createMany({
        data: inv.inviteAppIds.map((appId) => ({
          userId: dbUser.id,
          orgId: inv.orgId,
          appId,
          role: userAppRole,
          grantedBy: inv.createdBy,
        })),
        skipDuplicates: true,
      });
    }
  }

  try {
    await setOAuthPrefill(dbUser.id, {
      firstName: input.oauthFirstName ?? "",
      lastName: input.oauthLastName ?? "",
    });
  } catch (err) {
    console.error(
      "[auth.resolveOAuthIdentity] failed to stash OAuth pre-fill:",
      err,
    );
  }

  return { ok: true, dbUser };
}

// ─────────────────────────────────────────────────────────────────────────
// Broad invite acceptance — NATIVE MOBILE ONLY.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Accepts every pending invitation for an already-authenticated user,
 * regardless of `inviteMethod`.
 *
 * WHY THIS EXISTS SEPARATELY FROM `resolveOAuthIdentity`. On web there are
 * two acceptance passes: the `signIn` callback accepts `inviteMethod: "sso"`
 * invites (that is `resolveOAuthIdentity` above), and the `jwt` callback in
 * index.ts then accepts ANY remaining pending invite — deliberately not
 * filtered by method, because the label describes how the invite was
 * CREATED, not how the person chose to authenticate.
 *
 * Native mobile bypasses NextAuth entirely: this endpoint calls
 * `resolveOAuthIdentity` directly, and the target app's `/auth-handoff`
 * mints the cookie with `next-auth/jwt`'s `encode()`, which never runs the
 * `jwt` callback. Without this function the second pass simply never
 * happens on mobile.
 *
 * That matters because QuikInfra defaults invites to `native`
 * (`invitationMethod === "sso" ? "sso" : "native"`). A newly invited user
 * who taps "Sign in with Google" instead of opening their invite link would
 * otherwise keep `status: "invited"`, resolve to a null `orgId`, and be
 * bounced with no error explaining why — while the same person succeeds on
 * web. The implementation guide's Web ↔ Mobile parity rule forbids exactly
 * that divergence.
 *
 * Deliberately NOT folded into `resolveOAuthIdentity`: that function is
 * shared with the web `signIn` callback, and web behavior must stay
 * byte-identical.
 */
export async function acceptPendingInvites(userId: string): Promise<number> {
  const pending = await db.orgMember.findMany({
    where: { userId, status: "invited" },
  });
  for (const inv of pending) {
    await db.orgMember.update({
      where: { id: inv.id },
      data: { status: "active", acceptedAt: new Date(), invitationToken: null },
    });
    if (inv.inviteAppIds && inv.inviteAppIds.length > 0) {
      const userAppRole = inv.role === "app_admin" ? "admin" : "member";
      await db.userAppAccess.createMany({
        data: inv.inviteAppIds.map((appId) => ({
          userId,
          orgId: inv.orgId,
          appId,
          role: userAppRole,
          grantedBy: inv.createdBy,
        })),
        skipDuplicates: true,
      });
    }
  }
  return pending.length;
}

// ─────────────────────────────────────────────────────────────────────────
// Org/role resolution — extracted from apps/auth's post-login route.
// ─────────────────────────────────────────────────────────────────────────

export interface OrgContext {
  orgId: string | null;
  membershipRole: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
}

/**
 * Resolves the org/role/name fields a handoff token needs to carry. Falls
 * back to the user's first active org membership when none is already
 * known (matches post-login's existing fallback so the target app's
 * middleware never bounces the user to the org selector unnecessarily).
 */
export async function resolveOrgContext(params: {
  userId: string;
  knownOrgId?: string | null;
  knownMembershipRole?: string | null;
  knownEmail?: string | null;
}): Promise<OrgContext> {
  const { userId } = params;
  let orgId = params.knownOrgId ?? null;
  let membershipRole = params.knownMembershipRole ?? null;

  if (orgId && !membershipRole) {
    const member = await db.orgMember.findFirst({
      where: { userId, orgId, status: "active" },
      select: { role: true },
    });
    membershipRole = member?.role ?? null;
  }
  if (!orgId) {
    const first = await db.orgMember.findFirst({
      where: { userId, status: "active" },
      orderBy: { createdAt: "asc" },
      select: { orgId: true, role: true },
    });
    orgId = first?.orgId ?? null;
    membershipRole = membershipRole ?? first?.role ?? null;
  }

  const userRow = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, lastName: true },
  });
  const email = userRow?.email ?? params.knownEmail ?? null;
  const firstName = userRow?.firstName ?? null;
  const lastName = userRow?.lastName ?? null;
  const name =
    firstName || lastName
      ? `${firstName ?? ""} ${lastName ?? ""}`.trim()
      : null;

  return { orgId, membershipRole, email, firstName, lastName, name };
}

// ─────────────────────────────────────────────────────────────────────────
// Handoff token — extracted from apps/auth's post-login route.
// ─────────────────────────────────────────────────────────────────────────

export interface HandoffTokenClaims {
  userId: string;
  orgId: string | null;
  isSuperAdmin: boolean;
  membershipRole: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  sessionId: string | null;
  /** Path (+ query) on the target host to land on after the handoff. */
  to: string;
}

/**
 * Mints the same short-lived HS256 handoff token every consumer app's
 * `/auth-handoff` route already verifies (`INTERNAL_SECRET`, 120s TTL).
 * Used by both the web post-login bridge and native mobile sign-in.
 */
export async function mintHandoffToken(
  internalSecret: string,
  claims: HandoffTokenClaims,
): Promise<string> {
  const key = new TextEncoder().encode(internalSecret);
  return new SignJWT({
    sub: claims.userId,
    orgId: claims.orgId,
    to: claims.to,
    isSuperAdmin: claims.isSuperAdmin,
    membershipRole: claims.membershipRole,
    email: claims.email,
    firstName: claims.firstName,
    lastName: claims.lastName,
    name: claims.name,
    sessionId: claims.sessionId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("120s")
    .setJti(crypto.randomUUID())
    .sign(key);
}

// ─────────────────────────────────────────────────────────────────────────
// Target-origin allow-list — extracted from apps/auth's post-login route.
// Shared by web (callbackUrl) and native mobile (targetOrigin) so there is
// exactly one canonical list of hosts a handoff may ever redirect to.
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_ALLOWED_ORIGINS = [
  "https://quik-it-auth.vercel.app",
  "https://quikscale.vercel.app",
  "https://quik-it-admin.vercel.app",
  "https://quiktrack.vercel.app",
  "https://quikvc.vercel.app",
  "https://quiksocial.vercel.app",
  "https://quikinfra.vercel.app",
  "https://apps.quikit.ai",
  "https://scale.quikit.ai",
  "https://orgadmin.quikit.ai",
  "https://track.quikit.ai",
  "https://crm.quikit.ai",
  "https://social.quikit.ai",
  "https://quikinfra.quikit.ai",
  "https://quikhrms.vercel.app",
  "https://people.quikit.ai",
  "https://support.quikit.ai",
  "https://asset.quikit.ai",
  // UAT custom domains (uat<app>.quikit.ai) — added alongside prod.
  "https://uatapps.quikit.ai",
  "https://uatscale.quikit.ai",
  "https://uatorgadmin.quikit.ai",
  "https://uattrack.quikit.ai",
  "https://uatcrm.quikit.ai",
  "https://uatsocial.quikit.ai",
  "https://uatinfra.quikit.ai",
  "https://uatpeople.quikit.ai",
  "https://uatsupport.quikit.ai",
  "https://uatasset.quikit.ai",
  "https://uatlms.quikit.ai",
];

export function allowedTargetOrigins(): Set<string> {
  const extra = (process.env.AUTH_ALLOWED_RETURN_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}
