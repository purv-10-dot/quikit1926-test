import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@quikit/database";
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

// Simple in-memory rate limiter for login attempts (per email)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_RATE_LIMIT = 5; // max attempts
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minute window

function checkLoginRateLimit(email: string): boolean {
  const now = Date.now();
  const key = email.toLowerCase();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= LOGIN_RATE_LIMIT;
}

function resetLoginRateLimit(email: string): void {
  loginAttempts.delete(email.toLowerCase());
}

export function createAuthOptions(config: AuthConfig): NextAuthOptions {
  return {
    providers: [
      CredentialsProvider({
        name: "Credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) {
            throw new Error("Invalid credentials");
          }

          // Rate limit: 5 attempts per email per 15 minutes
          if (!checkLoginRateLimit(credentials.email)) {
            throw new Error("Too many login attempts. Please try again in 15 minutes.");
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

          // Successful login — reset rate limit counter
          resetLoginRateLimit(credentials.email);

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
        authorization: {
          url: `${quikitUrl}/api/oauth/authorize`,
          params: { scope: "openid profile email tenant" },
        },
        token: `${quikitUrl}/api/oauth/token`,
        userinfo: `${quikitUrl}/api/oauth/userinfo`,
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
        return token;
      },
      async session({ session, token }) {
        session.user = {
          ...session.user,
          id: token.id as string,
          email: token.email as string,
          tenantId: token.tenantId as string | undefined,
          membershipRole: token.membershipRole as string | undefined,
          isSuperAdmin: false,
        };
        return session;
      },
    },
  };
}
