import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@quikit/database";
import { rateLimitAsync } from "@quikit/shared/rateLimit";
import bcrypt from "bcryptjs";

export interface AuthConfig {
  signInPage: string;
  errorPage: string;
}

interface AuthUser {
  id: string;
  email: string | null;
  name?: string | null;
  isSuperAdmin?: boolean;
  tenantId?: string;
  membershipRole?: string;
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

          const user = await db.user.findUnique({
            where: { email: credentials.email as string },
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

          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            isSuperAdmin: user.isSuperAdmin,
          };
        },
      }),
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
      async jwt({ token, user, trigger, session }) {
        if (user) {
          token.id = user.id;
          token.email = user.email;
          token.isSuperAdmin = (user as AuthUser).isSuperAdmin ?? false;
        }

        if (trigger === "update" && session) {
          if (session.tenantId === null) {
            token.tenantId = undefined;
            token.membershipRole = undefined;
            token.membershipCheckedAt = undefined;
          } else if (session.tenantId) {
            token.tenantId = session.tenantId;
            token.membershipRole = session.membershipRole;
            token.membershipCheckedAt = Date.now();
          }
        }

        // Re-validate membership every 5 minutes
        const RECHECK_INTERVAL = 5 * 60 * 1000;
        if (
          token.tenantId &&
          token.id &&
          (!token.membershipCheckedAt ||
            Date.now() - (token.membershipCheckedAt as number) > RECHECK_INTERVAL)
        ) {
          const membership = await db.membership.findFirst({
            where: {
              userId: token.id as string,
              tenantId: token.tenantId as string,
              status: "active",
            },
          });

          if (!membership) {
            token.tenantId = undefined;
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
          tenantId: token.tenantId as string | undefined,
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
        // tenantId is not yet known at signIn (org selection happens after),
        // so we log with tenantId=null and a follow-up session event can be
        // emitted by the app's own layout/middleware once a tenant is active.
        try {
          await db.sessionEvent.create({
            data: {
              userId: user.id!,
              tenantId: null,
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
        try {
          await db.sessionEvent.create({
            data: {
              userId: token.id as string,
              tenantId: (token.tenantId as string | undefined) ?? null,
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
            tenantId: profile.tenant_id,
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
          token.tenantId = (user as AuthUser).tenantId;
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
        session.user = {
          ...session.user,
          id: token.id as string,
          email: token.email as string,
          tenantId: token.tenantId as string | undefined,
          membershipRole: token.membershipRole as string | undefined,
          isSuperAdmin: false,
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
