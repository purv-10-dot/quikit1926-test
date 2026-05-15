import { type NextAuthOptions } from "next-auth";
// Side-effect import: loads the next-auth module augmentation in types.ts
// so the Session.user shape inside this file recognizes firstName/lastName.
import "./types";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AzureADProvider from "next-auth/providers/azure-ad";
import { db } from "@quikit/database";
import { rateLimitAsync } from "@quikit/shared/rateLimit";
import bcrypt from "bcryptjs";
import {
  createAuthSession,
  revokeAuthSession,
  touchAuthSession,
} from "./session-store";
import { setOAuthPrefill } from "./oauth-prefill-store";

export interface AuthConfig {
  signInPage: string;
  errorPage: string;
}

interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  isSuperAdmin?: boolean;
  orgId?: string;
  membershipRole?: string;
  /** Stashed by Google/Azure profile() callbacks for post-OAuth pre-fill. */
  oauthFirstName?: string;
  oauthLastName?: string;
}

/** Split a single "First Last" string into parts (Microsoft profile shape). */
function splitName(name: string | undefined | null): { first: string; last: string } {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return { first: "", last: "" };
  const idx = trimmed.indexOf(" ");
  if (idx < 0) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, idx), last: trimmed.slice(idx + 1).trim() };
}

/**
 * NextAuth's `authorize(credentials, req)` hands us a plain Node request
 * whose `headers` shape is `IncomingHttpHeaders` — a record of string |
 * string[] | undefined. Extract the first plausible client IP so the
 * rate limiter can bucket attackers.
 *
 * In production behind Caddy / Vercel edge, `x-forwarded-for` is trusted;
 * the first IP in the list is the original client. Locally, both headers
 * are absent → "anonymous" (still useful because it groups the unknown-IP
 * population together).
 */
function nextAuthIp(
  req: { headers?: Record<string, string | string[] | undefined> } | undefined,
): string {
  const h = req?.headers ?? {};
  const xff = h["x-forwarded-for"];
  const ipStr = Array.isArray(xff) ? xff[0] : xff;
  if (ipStr) return String(ipStr).split(",")[0]!.trim();
  const real = h["x-real-ip"];
  if (real) return Array.isArray(real) ? real[0]! : String(real);
  return "anonymous";
}

/**
 * Fail-closed (return {ok: false}) only in production. In dev / tests,
 * the in-memory fallback works fine for a single process.
 */
const FAIL_CLOSED = process.env.NODE_ENV === "production";

export function createAuthOptions(config: AuthConfig): NextAuthOptions {
  return {
    providers: [
      CredentialsProvider({
        name: "Credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials, req) {
          if (!credentials?.email || !credentials?.password) {
            throw new Error("Invalid credentials");
          }

          // Two-axis rate limit, both distributed via Redis when REDIS_URL is
          // set. See docs/plans/P0-3-distributed-rate-limiter.md.
          //
          // Per-email: stops a targeted guessing attack on one account.
          // Per-IP:    stops credential-stuffing spreading across many emails.
          const emailKey = String(credentials.email).toLowerCase();
          const emailRL = await rateLimitAsync({
            routeKey: "auth:login:email",
            clientKey: emailKey,
            limit: 5,
            windowMs: 15 * 60 * 1000,
            failClosed: FAIL_CLOSED,
          });
          if (!emailRL.ok) {
            throw new Error(
              "Too many login attempts. Please try again in 15 minutes.",
            );
          }

          const ipRL = await rateLimitAsync({
            routeKey: "auth:login:ip",
            clientKey: nextAuthIp(req),
            limit: 20,
            windowMs: 15 * 60 * 1000,
            failClosed: FAIL_CLOSED,
          });
          if (!ipRL.ok) {
            throw new Error(
              "Too many login attempts from this IP. Try again later.",
            );
          }

          // Case-insensitive lookup so existing rows whose `email` was stored
          // with the casing the admin originally typed (e.g. "Foo@Bar.com")
          // still match what the user types into the sign-in form.
          const user = await db.user.findFirst({
            where: {
              email: {
                equals: String(credentials.email),
                mode: "insensitive",
              },
            },
          });

          if (!user || !user.password) {
            throw new Error("Invalid credentials");
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password as string,
            user.password
          );

          if (!isPasswordValid) {
            throw new Error("Invalid credentials");
          }

          // Unlike the old in-memory limiter, we can't cheaply reset the
          // counter on success — Redis TTL owns the bucket. Not resetting is
          // fine: successful logins are within the allowed-count window and
          // the bucket expires on its own.

          // Users added by a super admin start with empty firstName/lastName
          // (collected on first login via /complete-profile). Fall back to
          // email so session.user.name is never blank.
          const fullName = `${user.firstName} ${user.lastName}`.trim();
          return {
            id: user.id,
            email: user.email,
            name: fullName || user.email,
            isSuperAdmin: user.isSuperAdmin,
          };
        },
      }),
      // Google OAuth — only registered when both env vars are set so the
      // provider never appears in /api/auth/providers in dev environments
      // that haven't configured it.
      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? [
            GoogleProvider({
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
              // Force account chooser every time — avoids silent re-use of a
              // previously linked Google account when the user wants to
              // switch.
              authorization: { params: { prompt: "select_account" } },
              profile(profile) {
                console.log("[google.profile] raw profile from Google:", {
                  sub: profile.sub,
                  email: profile.email,
                  name: profile.name,
                  given_name: profile.given_name,
                  family_name: profile.family_name,
                });
                return {
                  // Placeholder id — `signIn` callback replaces it with the
                  // DB User.id once we've confirmed the email exists.
                  id: profile.sub,
                  email: profile.email ?? "",
                  name: profile.name ?? "",
                  oauthFirstName: profile.given_name ?? "",
                  oauthLastName: profile.family_name ?? "",
                } as AuthUser;
              },
            }),
          ]
        : []),
      // Microsoft OAuth (Azure AD / Entra ID). MICROSOFT_TENANT_ID="common"
      // accepts both work/school and personal Microsoft accounts. Set a
      // specific tenant GUID to restrict to one organization.
      ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
        ? [
            AzureADProvider({
              clientId: process.env.MICROSOFT_CLIENT_ID,
              clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
              tenantId: process.env.MICROSOFT_TENANT_ID || "common",
              profile(profile) {
                console.log("[azure-ad.profile] raw profile from Microsoft:", profile);
                // Azure AD's id_token rarely splits given/family — derive
                // both from `name` so we always have something to pre-fill.
                const split = splitName(profile.name);
                return {
                  id: (profile as { sub?: string; oid?: string }).sub ?? (profile as { oid?: string }).oid ?? "",
                  email:
                    (profile as { email?: string }).email ??
                    (profile as { preferred_username?: string }).preferred_username ??
                    "",
                  name: profile.name ?? "",
                  oauthFirstName: split.first,
                  oauthLastName: split.last,
                } as AuthUser;
              },
            }),
          ]
        : []),
    ],
    pages: {
      signIn: config.signInPage,
      error: config.errorPage,
    },
    session: {
      strategy: "jwt",
      maxAge: 30 * 24 * 60 * 60,
    },
    jwt: {
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 30 * 24 * 60 * 60,
    },
    callbacks: {
      /**
       * Gate every OAuth sign-in on the email already existing in the User
       * table. Returning a URL string redirects there; new users are NOT
       * auto-created — they need to be added by an org admin first.
       *
       * Side-effect: stash the OAuth profile's first/last name in the
       * pre-fill store (Redis, 10-min TTL) keyed by the matched DB user
       * id. The post-login profile-confirmation form reads this to
       * pre-populate its inputs. We deliberately do NOT write the names
       * to the User row here — keeping firstName/lastName empty until
       * the user clicks Continue is what makes /select-org route them
       * to the form in the first place (matches credentials behavior).
       */
      async signIn({ user, account }) {
        if (account?.provider === "google" || account?.provider === "azure-ad") {
          const email = (user.email ?? "").toLowerCase();
          if (!email) {
            console.warn("[auth.signIn] OAuth attempt with no email on profile");
            return "/login?reason=invalid_user_info";
          }
          // Case-insensitive lookup so historical rows that were inserted
          // with the original mixed-case email (e.g. "Pravin.Sharma@quikit.ai")
          // still match a lowercased OAuth email. Postgres' `mode: "insensitive"`
          // uses ILIKE under the hood, which still benefits from a regular
          // index on lower(email) — but for our membership volumes a normal
          // index scan is fine.
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
            console.warn("[auth.signIn] OAuth login rejected — unknown email:", email);
            return "/login?reason=invalid_user_info";
          }
          // FRD FR-SA-006 / FR-OA-004 — auto-accept any pending SSO invitation
          // for this user. We promote OrgMember rows where inviteMethod=sso and
          // status=invited to status=active, granting the corresponding
          // UserAppAccess rows. This is the SSO equivalent of the native
          // accept-invite endpoint POST handler.
          //
          // BR-005 — the SSO-authenticated email must equal the email the
          // invitation was sent to. Because OrgMember.userId points at the
          // User row whose `email` column we just matched, this equality is
          // automatic: a different OAuth email would have produced a different
          // (or null) `dbUser` above. So no explicit comparison is needed
          // here, but the audit log captures the link for traceability.
          const pendingInvites = await db.orgMember.findMany({
            where: {
              userId: dbUser.id,
              status: "invited",
              inviteMethod: "sso",
            },
          });
          for (const inv of pendingInvites) {
            await db.orgMember.update({
              where: { id: inv.id },
              data: {
                status: "active",
                acceptedAt: new Date(),
                invitationToken: null,
              },
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

          // Replace the provider-supplied id with the actual DB id so
          // downstream callbacks find the right OrgMember rows.
          user.id = dbUser.id;
          user.email = dbUser.email;
          (user as AuthUser).isSuperAdmin = dbUser.isSuperAdmin;

          // Stash OAuth names for the post-login form to pre-fill. Always
          // write — even if the DB row already has names — so the form
          // can show the latest provider-supplied values when users want
          // to refresh. Cleared by the PATCH endpoint on save.
          const oauthFirst = (user as AuthUser).oauthFirstName ?? "";
          const oauthLast = (user as AuthUser).oauthLastName ?? "";
          try {
            await setOAuthPrefill(dbUser.id, {
              firstName: oauthFirst,
              lastName: oauthLast,
            });
            console.log(
              "[auth.signIn] OAuth pre-fill stored for",
              email,
              { firstName: oauthFirst, lastName: oauthLast, provider: account.provider },
            );
          } catch (err) {
            console.error("[auth.signIn] failed to stash OAuth pre-fill:", err);
          }
          return true;
        }
        return true;
      },
      async jwt({ token, user, trigger, session }) {
        if (user) {
          token.id = user.id;
          token.email = user.email;
          token.isSuperAdmin = (user as AuthUser).isSuperAdmin ?? false;
          token.sessionId = await createAuthSession(user.id, 30 * 24 * 60 * 60);
          token.sessionTouchedAt = Date.now();

          // OAuth pre-fill: when the user came from Google/Azure, stash the
          // provider's given/family name on the JWT so the post-login profile
          // step can pre-fill its inputs even though the User row's
          // firstName/lastName columns are still empty.
          const oauthFirst = (user as AuthUser).oauthFirstName;
          const oauthLast = (user as AuthUser).oauthLastName;
          if (oauthFirst) token.oauthFirstName = oauthFirst;
          if (oauthLast) token.oauthLastName = oauthLast;

          // FRD FR-SA-006 — auto-accept any pending NATIVE invitations for
          // this user. SSO invites are accepted in the signIn callback
          // above (which runs only for OAuth providers), so credentials
          // logins would otherwise leave invited memberships in status
          // "invited" — token.orgId stays undefined and the launcher
          // bounces the user between /apps ↔ /select-org indefinitely.
          // The user has authenticated against their stored password, so
          // we treat that as proof of identity equivalent to clicking the
          // accept-invite link.
          const pendingNativeInvites = await db.orgMember.findMany({
            where: {
              userId: user.id,
              status: "invited",
              inviteMethod: "native",
            },
          });
          for (const inv of pendingNativeInvites) {
            await db.orgMember.update({
              where: { id: inv.id },
              data: {
                status: "active",
                acceptedAt: new Date(),
                invitationToken: null,
              },
            });
            if (inv.inviteAppIds && inv.inviteAppIds.length > 0) {
              const userAppRole = inv.role === "app_admin" ? "admin" : "member";
              await db.userAppAccess.createMany({
                data: inv.inviteAppIds.map((appId) => ({
                  userId: user.id,
                  orgId: inv.orgId,
                  appId,
                  role: userAppRole,
                  grantedBy: inv.createdBy,
                })),
                skipDuplicates: true,
              });
            }
          }

          // Auto-select first active org on initial sign-in so the user is
          // dropped straight onto the launcher (/apps) without an interstitial
          // /select-org step. Multi-org users can still switch orgs from the
          // launcher header — /select-org is reachable on demand, not forced.
          const firstMembership = await db.orgMember.findFirst({
            where: { userId: user.id, status: "active" },
            orderBy: { createdAt: "asc" },
            select: { orgId: true, role: true },
          });
          if (firstMembership) {
            token.orgId = firstMembership.orgId;
            token.membershipRole = firstMembership.role;
            token.membershipCheckedAt = Date.now();
          }
        }

        const SESSION_TOUCH_INTERVAL = 5 * 60 * 1000;
        if (
          token.sessionId &&
          (!token.sessionTouchedAt ||
            Date.now() - (token.sessionTouchedAt as number) > SESSION_TOUCH_INTERVAL)
        ) {
          await touchAuthSession(String(token.sessionId), 30 * 24 * 60 * 60);
          token.sessionTouchedAt = Date.now();
        }

        if (trigger === "update" && session) {
          if (session.orgId === null) {
            token.orgId = undefined;
            token.membershipRole = undefined;
            token.membershipCheckedAt = undefined;
          } else if (session.orgId) {
            token.orgId = session.orgId;
            token.membershipRole = session.membershipRole;
            token.membershipCheckedAt = Date.now();
          }
        }

        // Re-validate membership every 5 minutes
        const RECHECK_INTERVAL = 5 * 60 * 1000;
        if (
          token.orgId &&
          token.id &&
          (!token.membershipCheckedAt ||
            Date.now() - (token.membershipCheckedAt as number) > RECHECK_INTERVAL)
        ) {
          const membership = await db.orgMember.findFirst({
            where: {
              userId: token.id as string,
              orgId: token.orgId as string,
              status: "active",
            },
          });

          if (!membership) {
            token.orgId = undefined;
            token.membershipRole = undefined;
            token.membershipCheckedAt = undefined;
            token.membershipInvalid = true;
          } else {
            token.membershipRole = membership.role;
            token.membershipCheckedAt = Date.now();
            token.membershipInvalid = undefined;
          }
        }

        return token;
      },
      async session({ session, token }) {
        session.user = {
          ...session.user,
          id: token.id as string,
          email: token.email as string,
          orgId: token.orgId as string | undefined,
          membershipRole: token.membershipRole as string | undefined,
          membershipInvalid: token.membershipInvalid as boolean | undefined,
          isSuperAdmin: token.isSuperAdmin as boolean | undefined,
        };
        return session;
      },
    },
    events: {
      async signIn({ user }) {
        await db.user.update({
          where: { id: user.id! },
          data: { lastSignInAt: new Date() },
        });
        // SA-A.5: record a SessionEvent for analytics.
        // orgId is not yet known at signIn (org selection happens after),
        // so we log with orgId=null and a follow-up session event can be
        // emitted by the app's own layout/middleware once a tenant is active.
        try {
          await db.sessionEvent.create({
            data: {
              userId: user.id!,
              orgId: null,
              event: "login",
              appSlug: "quikit",
            },
          });
        } catch {
          // Never break sign-in on a logging failure.
        }
      },
      async signOut({ token }) {
        if (!token?.id) return;
        const sessionId = token.sessionId as string | undefined;
        if (sessionId) {
          await revokeAuthSession(sessionId);
        }
        try {
          await db.sessionEvent.create({
            data: {
              userId: token.id as string,
              orgId: (token.orgId as string | undefined) ?? null,
              event: "logout",
              appSlug: "quikit",
            },
          });
        } catch {
          // no-op
        }
      },
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   OAuth Client Auth — for apps that authenticate via QuikIT as IdP
   ═══════════════════════════════════════════════════════════════════════════

   Usage in apps/quikscale/lib/auth.ts:
     import { createOAuthClientOptions } from "@quikit/auth";
     export const authOptions = createOAuthClientOptions({
       quikitUrl: process.env.QUIKIT_URL!,
       clientId: process.env.QUIKIT_CLIENT_ID!,
       clientSecret: process.env.QUIKIT_CLIENT_SECRET!,
     });
   ═══════════════════════════════════════════════════════════════════════════ */

export interface OAuthClientConfig {
  /** Base URL of the QuikIT gateway (e.g., "http://localhost:3000") */
  quikitUrl: string;
  /** OAuth client_id registered in QuikIT's OAuthClient table */
  clientId: string;
  /** OAuth client_secret (plain text — compared against bcrypt hash in QuikIT) */
  clientSecret: string;
  /** Page to redirect to if auth fails (defaults to quikitUrl + /login) */
  errorPage?: string;
}

/**
 * Creates NextAuth options for an app that authenticates via QuikIT's
 * OAuth2/OIDC flow. The user never sees a login page on the app itself —
 * they're redirected to QuikIT to authenticate, then redirected back
 * with an authorization code that's exchanged for tokens.
 */
export function createOAuthClientOptions(config: OAuthClientConfig): NextAuthOptions {
  const { quikitUrl, clientId, clientSecret } = config;

  return {
    providers: [
      {
        id: "quikit",
        name: "QuikIT",
        type: "oauth",
        // OIDC discovery — NextAuth fetches /.well-known/openid-configuration
        // to locate jwks_uri and verify the id_token signature. Without this,
        // the callback errors out with OAUTH_CALLBACK_ERROR before userinfo
        // is ever called.
        wellKnown: `${quikitUrl}/.well-known/openid-configuration`,
        issuer: quikitUrl,
        idToken: true,
        authorization: {
          params: { scope: "openid profile email tenant" },
        },
        clientId,
        clientSecret,
        checks: ["state"],
        profile(profile) {
          return {
            id: profile.sub,
            email: profile.email,
            name: profile.name,
            orgId: profile.tenant_id,
            membershipRole: profile.role,
          };
        },
      },
    ],
    pages: {
      signIn: `${quikitUrl}/login`,
      error: config.errorPage ?? `${quikitUrl}/login`,
    },
    session: {
      strategy: "jwt",
      maxAge: 7 * 24 * 60 * 60, // 7 days (shorter than IdP — refresh via OAuth)
    },
    jwt: {
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 7 * 24 * 60 * 60,
    },
    // Log the full OAuth error (NextAuth's default logger truncates multi-line
     // messages in serverless output, hiding the actual cause of callback failures).
    logger: {
      error(code, metadata) {
        // NextAuth passes metadata as { error, providerId } on OAuth callback
        // failures. Unwrap recursively so the underlying openid-client error
        // message appears inline (Vercel truncates multi-line stacks).
        function describe(e: unknown, depth = 0): string {
          if (depth > 4 || e == null) return String(e);
          if (e instanceof Error) {
            const cause = (e as { cause?: unknown }).cause;
            const extras: string[] = [];
            for (const k of Object.keys(e)) {
              // serialize extra props openid-client sets (e.g., response, checks)
              try {
                extras.push(`${k}=${JSON.stringify((e as unknown as Record<string, unknown>)[k])}`);
              } catch {
                extras.push(`${k}=<unserializable>`);
              }
            }
            return `${e.name}:${e.message}${extras.length ? " {" + extras.join(",") + "}" : ""}${cause ? " <caused by> " + describe(cause, depth + 1) : ""}`;
          }
          if (typeof e === "object") {
            const parts: string[] = [];
            for (const [k, v] of Object.entries(e as Record<string, unknown>)) {
              parts.push(`${k}=${describe(v, depth + 1)}`);
            }
            return `{${parts.join(",")}}`;
          }
          try { return JSON.stringify(e); } catch { return String(e); }
        }
        // Chunk the serialized message into short pieces so Vercel's truncated
        // log table (which cuts off around 30 chars per Message column) still
        // surfaces the full string across multiple rows.
        const full = describe(metadata);
        const CHUNK = 120;
        const total = Math.ceil(full.length / CHUNK) || 1;
        for (let i = 0; i < total; i++) {
          const part = full.slice(i * CHUNK, (i + 1) * CHUNK);
          // eslint-disable-next-line no-console
          console.error(`[qka][${code}][${i + 1}/${total}] ${part}`);
        }
      },
      warn(code) {
        // eslint-disable-next-line no-console
        console.warn(`[quikit-auth][warn][${code}]`);
      },
      debug() {
        // no-op in production
      },
    },
    callbacks: {
      async jwt({ token, user, account }) {
        // On initial sign-in (after OAuth callback), populate token from user profile
        if (user) {
          token.id = user.id;
          token.email = user.email;
          token.orgId = (user as AuthUser).orgId;
          token.membershipRole = (user as AuthUser).membershipRole;
          token.isSuperAdmin = false; // Apps don't inherit super admin status
        }
        // Store the access_token + refresh_token from the OAuth exchange
        if (account) {
          token.accessToken = account.access_token;
          token.refreshToken = account.refresh_token;
          token.accessTokenExpires = Date.now() + (account.expires_in as number ?? 3600) * 1000;
        }
        // SA-D: if the token is an impersonation session (set directly by the
        // accept endpoint), the impersonating flag + claims are already on it
        // and we must pass them through unchanged. Don't overwrite.
        return token;
      },
      async session({ session, token }) {
        // SA-D: when impersonation is active, hard-fail the session if the
        // expiry passed. Returning a session without user.id effectively
        // signs the user out (middleware will bounce them to /login).
        if (token.impersonating && token.impersonationExpiresAt) {
          if (new Date(token.impersonationExpiresAt).getTime() < Date.now()) {
            return { ...session, user: { ...session.user, id: "" as string, email: "" } as never };
          }
        }
        // Compose display name from firstName/lastName if the token carries
        // them (the launcher's hand-off mint includes profile fields so the
        // consumer app's header / avatar can render real names instead of
        // the generic "User" placeholder).
        const firstName = token.firstName as string | undefined;
        const lastName = token.lastName as string | undefined;
        const composedName =
          (token.name as string | undefined) ??
          (firstName || lastName
            ? `${firstName ?? ""} ${lastName ?? ""}`.trim()
            : undefined);

        session.user = {
          ...session.user,
          id: token.id as string,
          email: token.email as string,
          orgId: token.orgId as string | undefined,
          membershipRole: token.membershipRole as string | undefined,
          // Mirror the token's super-admin claim through to the session so
          // platform super-admins see correct UI affordances inside consumer
          // apps. (Was hardcoded to false; restored to token-driven value.)
          isSuperAdmin: Boolean(token.isSuperAdmin),
          name: composedName,
          firstName,
          lastName,
          impersonating: token.impersonating,
          impersonatorUserId: token.impersonatorUserId,
          impersonatorEmail: token.impersonatorEmail,
          impersonationExpiresAt: token.impersonationExpiresAt,
        };
        return session;
      },
    },
  };
}
