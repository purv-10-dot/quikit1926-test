import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import { createOAuthClientOptions, createAuthOptions } from "@quikit/auth";
import "@quikit/auth/types";

/**
 * QuikInsight auth configuration.
 * Uses QuikIT OAuth2 SSO when QUIKIT_URL + credentials are set.
 * Falls back to direct NextAuth for local development without the IdP.
 */
const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.QUIKIT_ISSUER_URL;
const QUIKIT_CLIENT_ID = process.env.QUIKIT_CLIENT_ID;
const QUIKIT_CLIENT_SECRET = process.env.QUIKIT_CLIENT_SECRET;

export const authOptions: NextAuthOptions =
  QUIKIT_URL && QUIKIT_CLIENT_ID && QUIKIT_CLIENT_SECRET
    ? createOAuthClientOptions({
        quikitUrl: QUIKIT_URL,
        clientId: QUIKIT_CLIENT_ID,
        clientSecret: QUIKIT_CLIENT_SECRET,
      })
    : createAuthOptions({
        signInPage: "/login",
        errorPage: "/login",
      });

/**
 * Drop-in shim for next-auth v5 `auth()` call pattern.
 * Routes that call `const session = await auth()` continue to work unchanged.
 */
export async function auth() {
  return getServerSession(authOptions);
}
