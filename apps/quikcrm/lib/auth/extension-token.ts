/**
 * Bearer-token auth for the LinkedIn Chrome extension.
 *
 * The extension authenticates its API calls with a Bearer token — the
 * NextAuth-compatible JWT minted by /api/extension-auth/callback. This app's
 * normal routes read the session from a cookie via getServerSession and ignore
 * Bearer, so extension-facing routes verify the token themselves with the same
 * NEXTAUTH_SECRET used to mint it.
 *
 * This centralises the decode that /api/extension-auth/organizations first
 * inlined, so every extension endpoint verifies tokens identically.
 */
import type { NextRequest } from "next/server";
import { decode } from "next-auth/jwt";

export interface ExtensionUser {
  userId: string;
  email: string;
  name: string;
}

/**
 * Verify the request's Bearer token. Returns the extension user on success, or
 * null when the header is missing/malformed, the secret is unset, or the token
 * is invalid/tampered. Callers translate null into a 401/500 as appropriate.
 */
export async function verifyExtensionToken(
  request: NextRequest,
): Promise<ExtensionUser | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!token) return null;

  // A malformed / tampered token makes decode() throw — treat any decode
  // failure as an auth failure, not a server error.
  let payload: Awaited<ReturnType<typeof decode>> = null;
  try {
    payload = await decode({ token, secret });
  } catch {
    payload = null;
  }
  const userId = (payload?.id as string | undefined) ?? payload?.sub;
  if (!payload || !userId) return null;

  return {
    userId,
    email: (payload.email as string | undefined) ?? "",
    name: (payload.name as string | undefined) ?? "",
  };
}
